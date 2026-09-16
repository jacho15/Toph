"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { localTimeToIso } from "@/lib/tz";
import { extractVoiceLog, type FieldInfo } from "@/lib/ai/extract-voice-log";
import { checkAiBudget, getClientIpHash, recordAiUsage } from "@/lib/ai/budget";

type ActionFailure = { ok: false; error: string; code?: "rate_limited"; retryAfterSeconds?: number };

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true } | ActionFailure
  : { ok: true; data: T } | ActionFailure;

const uuid = z.guid();

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
});

export type CreateVoiceLogInput = z.infer<typeof createVoiceLogSchema>;

/**
 * Isolated extraction step. Kept as its own function (rather than inlined into
 * `createVoiceLog`) so a per-request spend limiter can later wrap this exact call — a
 * pre-check before, and a usage record from `result.usage` after — without touching the
 * rest of the action.
 */
async function runExtractionStep(transcript: string, recordedAtIso: string, fields: FieldInfo[]) {
  return extractVoiceLog({ transcript, recordedAtIso, fields });
}

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
    .select("farm_id")
    .eq("id", userId)
    .single();
  if (!viewerProfile) return { ok: false, error: "Not authenticated." };

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

  const ipHash = await getClientIpHash();
  const budgetCheck = await checkAiBudget(ipHash);
  if (!budgetCheck.allowed) {
    await supabase.storage.from("recordings").remove([data.audioPath]);
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
    employee_id: userId,
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
      spoken_name: result.spoken_name,
      confidence: result.confidence,
    },
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

/**
 * Lets the client check the AI spend budget *before* uploading audio, so a
 * rate-limited user is told up front instead of after paying the upload
 * cost only to have `createVoiceLog` reject the extraction.
 */
export async function getAiBudgetStatus(): Promise<{
  allowed: boolean;
  message?: string;
  retryAfterSeconds?: number;
}> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    return { allowed: false, message: "Not authenticated." };
  }

  const ipHash = await getClientIpHash();
  const budgetCheck = await checkAiBudget(ipHash);
  if (budgetCheck.allowed) return { allowed: true };
  return { allowed: false, message: budgetCheck.message, retryAfterSeconds: budgetCheck.retryAfterSeconds };
}
