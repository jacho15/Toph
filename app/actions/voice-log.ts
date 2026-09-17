"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { localTimeToIso } from "@/lib/tz";
import { buildSchema, extractVoiceLog, type FieldInfo, type VoiceLogExtraction } from "@/lib/ai/extract-voice-log";
import { checkAiBudget, getClientIpHash, recordAiUsage } from "@/lib/ai/budget";

type ActionFailure = { ok: false; error: string; code?: "rate_limited"; retryAfterSeconds?: number };

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true } | ActionFailure
  : { ok: true; data: T } | ActionFailure;

const uuid = z.guid();

/**
 * Isolated extraction step. Kept as its own function (rather than inlined into
 * `prepareVoiceLog`) so a per-request spend limiter can wrap this exact call — a
 * pre-check before, and a usage record from `result.usage` after — without touching the
 * rest of the action.
 */
async function runExtractionStep(transcript: string, recordedAtIso: string, fields: FieldInfo[]) {
  return extractVoiceLog({ transcript, recordedAtIso, fields });
}

export type PersonCandidate = {
  kind: "profile" | "crew";
  id: string;
  fullName: string;
  isSelf: boolean;
};

export type VoiceLogSuggestion =
  | { mode: "none" }
  | { mode: "self"; spokenName: string; selfName: string }
  | { mode: "candidates"; spokenName: string; candidates: PersonCandidate[] }
  | { mode: "new_person"; spokenName: string; candidates: PersonCandidate[] };

/** An active profile on the caller's farm, offered to admin/manager as a manual assignment target. */
export type AssignablePerson = { id: string; fullName: string; role: "admin" | "manager" | "worker" };

type MatchPersonRow = { kind: string; id: string; full_name: string; score: number; is_self: boolean };

/** Raw RPC rows, score included — used server-side only to decide the suggestion mode. */
async function matchPersonByName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string,
): Promise<MatchPersonRow[]> {
  const { data, error } = await supabase.rpc("match_person_by_name", { p_name: name });
  if (error || !data) {
    console.error("match_person_by_name RPC failed", error);
    return [];
  }
  return data as MatchPersonRow[];
}

/** Client-facing shape: no score (the UI shows a "subtle score-free description" only). */
function toPersonCandidate(row: MatchPersonRow): PersonCandidate {
  return { kind: row.kind as "profile" | "crew", id: row.id, fullName: row.full_name, isSelf: row.is_self };
}

async function runMatchPersonByName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string,
): Promise<PersonCandidate[]> {
  return (await matchPersonByName(supabase, name)).map(toPersonCandidate);
}

const prepareVoiceLogSchema = z.object({
  transcript: z.string().trim().min(1).max(10000),
  recordedAt: z.iso.datetime({ offset: true }),
});

export type PrepareVoiceLogResult =
  | {
      ok: true;
      extraction: VoiceLogExtraction;
      suggestion: VoiceLogSuggestion;
      /** Present only for admin/manager callers — lets the UI offer a manual person picker
       *  (upload-on-behalf-of-the-crew flow) without a second round trip. */
      assignablePeople?: AssignablePerson[];
    }
  | ActionFailure;

/**
 * Step 1 of the record flow: authenticates, checks the AI spend budget, runs the Claude
 * extraction, and — when a name was spoken — resolves it against the farm's people so the UI
 * can confirm attribution *before* anything is uploaded or saved. Every role may record or
 * upload a clip (the owner's reversal of the earlier worker-only restriction): the valuable
 * case is an admin uploading a clip on the crew's behalf, with spoken-name matching (or a
 * manual pick from `assignablePeople`) deciding who it belongs to.
 */
export async function prepareVoiceLog(input: {
  transcript: string;
  recordedAt: string;
}): Promise<PrepareVoiceLogResult> {
  const parsed = prepareVoiceLogSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "Not authenticated." };

  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("farm_id, role, full_name")
    .eq("id", userId)
    .single();
  if (!viewerProfile) return { ok: false, error: "Not authenticated." };

  const isAdminOrManager = viewerProfile.role === "admin" || viewerProfile.role === "manager";
  let assignablePeople: AssignablePerson[] | undefined;
  if (isAdminOrManager) {
    const { data: peopleRows } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("farm_id", viewerProfile.farm_id)
      .eq("is_active", true)
      .order("full_name");
    assignablePeople = (peopleRows ?? []).map((p) => ({ id: p.id, fullName: p.full_name, role: p.role }));
  }

  const { data: fieldRows } = await supabase
    .from("fields")
    .select("id, name, crop")
    .eq("farm_id", viewerProfile.farm_id);
  const fields = fieldRows ?? [];

  const ipHash = await getClientIpHash();
  const budgetCheck = await checkAiBudget(ipHash);
  if (!budgetCheck.allowed) {
    return {
      ok: false,
      error: budgetCheck.message,
      code: "rate_limited",
      retryAfterSeconds: budgetCheck.retryAfterSeconds,
    };
  }

  const extraction = await runExtractionStep(
    data.transcript,
    data.recordedAt,
    fields.map((f) => ({ name: f.name, crop: f.crop })),
  );

  if (extraction.usage) {
    await recordAiUsage({ ipHash, userId, usage: extraction.usage });
  }

  if (!extraction.ok) {
    return { ok: false, error: extraction.error };
  }
  const result = extraction.result;

  const spokenName = result.spoken_name?.trim();
  if (!spokenName) {
    return { ok: true, extraction: result, suggestion: { mode: "none" }, assignablePeople };
  }

  const rawMatches = await matchPersonByName(supabase, spokenName);
  const best = rawMatches[0];

  if (best && best.is_self && best.score >= 0.6) {
    return {
      ok: true,
      extraction: result,
      suggestion: { mode: "self", spokenName, selfName: viewerProfile.full_name },
      assignablePeople,
    };
  }
  if (rawMatches.length > 0) {
    return {
      ok: true,
      extraction: result,
      suggestion: { mode: "candidates", spokenName, candidates: rawMatches.map(toPersonCandidate) },
      assignablePeople,
    };
  }
  return {
    ok: true,
    extraction: result,
    suggestion: { mode: "new_person", spokenName, candidates: [] },
    assignablePeople,
  };
}

/**
 * Lets the "choose an existing person" option in the `new_person` step re-query candidates
 * on demand (e.g. after the worker types a correction), without re-running the extraction.
 */
export async function searchPersonCandidates(name: string): Promise<ActionResult<PersonCandidate[]>> {
  const parsed = z.string().trim().min(1).max(80).safeParse(name);
  if (!parsed.success) return { ok: false, error: "Invalid name." };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, error: "Not authenticated." };

  return { ok: true, data: await runMatchPersonByName(supabase, parsed.data) };
}

const attributionSchema = z.discriminatedUnion("kind", [
  // No spoken name was heard (suggestion mode "none") — leave both attribution columns
  // null so `display_name` falls back to the recorder, same as before this feature.
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("self") }),
  z.object({ kind: z.literal("profile"), id: uuid }),
  z.object({ kind: z.literal("crew"), id: uuid }),
  z.object({ kind: z.literal("new_crew"), fullName: z.string().trim().min(2).max(80) }),
]);

const extractionSchema = z.object({
  activity: z.string(),
  field_name: z.string().nullable(),
  started_local_time: z.string().nullable(),
  ended_local_time: z.string().nullable(),
  product: z.string().nullable(),
  rate: z.string().nullable(),
  notes: z.string().nullable(),
  spoken_name: z.string().nullable(),
  summary: z.string(),
  answers: z.array(
    z.object({
      question_key: z.string(),
      question: z.string(),
      answer: z.string(),
      is_valid: z.boolean(),
    }),
  ),
  confidence: z.number(),
});

const createVoiceLogSchema = z.object({
  logId: uuid,
  audioPath: z.string().min(1).max(500),
  audioMime: z.string().min(1).max(100),
  durationS: z.number().positive().max(3600),
  peaks: z.array(z.number().min(0).max(1)).min(20).max(400),
  transcript: z.string().trim().min(1).max(10000),
  recordedAt: z.iso.datetime({ offset: true }),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
  // Loosely shaped here; re-validated below against the farm-specific schema (which
  // constrains field_name to the farm's actual field names) before it's ever used.
  extraction: extractionSchema,
  attribution: attributionSchema,
});

export type CreateVoiceLogInput = z.infer<typeof createVoiceLogSchema>;

/**
 * Step 2 of the record flow: no Claude call here. `extraction` comes back from the client
 * exactly as `prepareVoiceLog` returned it (round-tripped through the Identify step's UI
 * state) — that's safe because it's always the signed-in caller's own not-yet-saved log,
 * every field is re-validated below against the same schema `prepareVoiceLog` used
 * (including the farm's actual field names), and re-running the extraction here would
 * double-charge the AI budget for a single recording.
 *
 * Ownership resolution is role-aware (see the comment on the `admin_uploads` migration for
 * the full semantics):
 *   - worker: always `employee_id = uploaded_by = auth.uid()` — a worker can attribute the
 *     log to a crew member (no login) via `attribution`, but can never assign it to another
 *     worker's *profile* (enforced here, and backstopped by the `logs` RLS insert policy).
 *   - admin/manager: always `uploaded_by = auth.uid()`; `employee_id` follows `attribution` —
 *     an explicit assignee is required (`kind: "none"` is rejected), since an admin/manager
 *     upload with nobody chosen would silently file the log under the admin.
 */
export async function createVoiceLog(input: CreateVoiceLogInput): Promise<ActionResult<{ logId: string }>> {
  const parsed = createVoiceLogSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "Not authenticated." };

  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("farm_id, role")
    .eq("id", userId)
    .single();
  if (!viewerProfile) return { ok: false, error: "Not authenticated." };

  const isAdminOrManager = viewerProfile.role === "admin" || viewerProfile.role === "manager";

  // Defense in depth: the `logs` RLS insert policy is the actual enforcement point (a worker
  // can only insert with `employee_id = auth.uid()`), but reject early with a clear message
  // rather than letting the insert fail with a bare RLS error.
  if (!isAdminOrManager && data.attribution.kind === "profile" && data.attribution.id !== userId) {
    return { ok: false, error: "You can only file a voice log for yourself." };
  }
  if (isAdminOrManager && data.attribution.kind === "none") {
    return { ok: false, error: "Choose who this log is for before saving." };
  }

  // Storage objects are always keyed by the *uploader* (`<farm_id>/<auth uid>/...`, see the
  // `recordings_insert_own` storage policy) — the same for every role, since `uploaded_by` is
  // always `auth.uid()` regardless of who `employee_id` resolves to below.
  const expectedPrefix = `${viewerProfile.farm_id}/${userId}/`;
  if (!data.audioPath.startsWith(expectedPrefix)) {
    return { ok: false, error: "Recording path does not belong to this user." };
  }

  const { data: farm } = await supabase
    .from("farms")
    .select("timezone")
    .eq("id", viewerProfile.farm_id)
    .single();
  const timezone = farm?.timezone ?? "UTC";

  const { data: fieldRows } = await supabase
    .from("fields")
    .select("id, name, crop")
    .eq("farm_id", viewerProfile.farm_id);
  const fields = fieldRows ?? [];

  const extractionSchemaForFarm = buildSchema(fields.map((f) => ({ name: f.name, crop: f.crop })));
  const parsedExtraction = extractionSchemaForFarm.safeParse(data.extraction);
  if (!parsedExtraction.success) {
    return { ok: false, error: "The extraction data for this log is no longer valid. Please start over." };
  }
  const result = parsedExtraction.data;

  // Resolve `employee_id` (who the work belongs to) and, when it can't be a profile, the
  // usual `attributed_profile_id` / `attributed_crew_member_id` pair (at most one ever set).
  // `uploaded_by` is always the caller — this is the recorder for a worker, the uploader for
  // an admin/manager.
  let employeeId = userId;
  let attributedProfileId: string | null = null;
  let attributedCrewMemberId: string | null = null;

  if (data.attribution.kind === "none") {
    // Leave both attribution columns null (worker only — admin/manager was rejected above).
  } else if (data.attribution.kind === "self") {
    // employee_id already defaults to the caller; still record self-attribution for display
    // consistency with the "profile"/"crew" branches.
    attributedProfileId = userId;
  } else if (data.attribution.kind === "profile") {
    const { data: person } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", data.attribution.id)
      .eq("farm_id", viewerProfile.farm_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!person) return { ok: false, error: "Selected person could not be found on this farm." };
    if (isAdminOrManager) {
      // Admin/manager uploads assign the work directly to the matched worker's profile —
      // `employee_id` becomes that worker, not the admin. (Rejected above already if a
      // worker tried to name someone other than themselves here.)
      employeeId = person.id;
    } else {
      attributedProfileId = person.id;
    }
  } else if (data.attribution.kind === "crew") {
    const { data: crewMember } = await supabase
      .from("crew_members")
      .select("id")
      .eq("id", data.attribution.id)
      .eq("farm_id", viewerProfile.farm_id)
      .maybeSingle();
    if (!crewMember) return { ok: false, error: "Selected crew member could not be found on this farm." };
    attributedCrewMemberId = crewMember.id;
  } else {
    // new_crew: reuse a case-insensitively matching crew member if one already exists
    // (the unique index on (farm_id, lower(full_name)) is the source of truth for this),
    // otherwise create one.
    const { data: existing } = await supabase
      .from("crew_members")
      .select("id")
      .eq("farm_id", viewerProfile.farm_id)
      .ilike("full_name", data.attribution.fullName)
      .maybeSingle();

    if (existing) {
      attributedCrewMemberId = existing.id;
    } else {
      const { data: created, error: createError } = await supabase
        .from("crew_members")
        .insert({ farm_id: viewerProfile.farm_id, full_name: data.attribution.fullName, created_by: userId })
        .select("id")
        .single();
      if (createError || !created) {
        // Lost a race with another insert of the same name — fetch the one that won.
        const { data: raced } = await supabase
          .from("crew_members")
          .select("id")
          .eq("farm_id", viewerProfile.farm_id)
          .ilike("full_name", data.attribution.fullName)
          .maybeSingle();
        if (!raced) return { ok: false, error: createError?.message ?? "Could not add crew member." };
        attributedCrewMemberId = raced.id;
      } else {
        attributedCrewMemberId = created.id;
      }
    }
  }

  const matchedField = result.field_name ? fields.find((f) => f.name === result.field_name) : undefined;

  const endedAt = result.ended_local_time
    ? localTimeToIso(result.ended_local_time, data.recordedAt, timezone)
    : data.recordedAt;
  const startedAt = result.started_local_time
    ? localTimeToIso(result.started_local_time, data.recordedAt, timezone)
    : new Date(new Date(data.recordedAt).getTime() - data.durationS * 1000).toISOString();

  const location = data.location ? `SRID=4326;POINT(${data.location.lng} ${data.location.lat})` : null;

  const roundedPeaks = data.peaks.map((n) => Math.round(n * 1000) / 1000);

  const { error: insertError } = await supabase.from("logs").insert({
    id: data.logId,
    farm_id: viewerProfile.farm_id,
    employee_id: employeeId,
    uploaded_by: userId,
    field_id: matchedField?.id ?? null,
    activity: result.activity,
    started_at: startedAt,
    ended_at: endedAt,
    audio_path: data.audioPath,
    audio_mime: data.audioMime,
    duration_s: data.durationS,
    waveform_peaks: roundedPeaks,
    transcript: data.transcript,
    summary: result.summary,
    details: {
      product: result.product,
      rate: result.rate,
      notes: result.notes,
      confidence: result.confidence,
    },
    spoken_name: result.spoken_name,
    attributed_profile_id: attributedProfileId,
    attributed_crew_member_id: attributedCrewMemberId,
    location: location ?? undefined,
    source: "web",
  });

  if (insertError) {
    await supabase.storage.from("recordings").remove([data.audioPath]);
    return { ok: false, error: insertError.message };
  }

  const answerRows = result.answers.map((answer, index) => ({
    log_id: data.logId,
    question_key: answer.question_key,
    question: answer.question,
    answer: answer.answer,
    is_valid: answer.is_valid,
    position: index,
  }));

  if (answerRows.length > 0) {
    const { error: answersError } = await supabase.from("log_answers").insert(answerRows);
    if (answersError) {
      // A submitted log is an immutable record from the field — workers have no DELETE
      // policy on `logs` (see the RLS migration), so the log row itself can't be rolled
      // back here. Still try to remove the uploaded object, best-effort.
      await supabase.storage.from("recordings").remove([data.audioPath]);
      return { ok: false, error: answersError.message };
    }
  }

  revalidatePath("/dashboard");
  return { ok: true, data: { logId: data.logId } };
}
