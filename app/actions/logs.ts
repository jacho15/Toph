"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ACTIVITY_TYPES } from "@/lib/ai/extract-voice-log";
import type { Database, Json } from "@/lib/database.types";
import type { Tag } from "@/lib/types";

type LogsUpdate = Database["public"]["Tables"]["logs"]["Update"];

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };

// z.guid(): seeded demo rows use fixed, non-RFC-4122 ids that z.uuid() rejects.
const uuid = z.guid();

export async function markLogsRead(ids: string[]): Promise<ActionResult> {
  const parsed = z.array(uuid).min(1).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Invalid log ids." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_logs_read", { p_log_ids: parsed.data });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function getAudioUrl(logId: string): Promise<ActionResult<string>> {
  const parsed = uuid.safeParse(logId);
  if (!parsed.success) return { ok: false, error: "Invalid log id." };

  const supabase = await createClient();
  const { data: log, error: logError } = await supabase
    .from("logs")
    .select("audio_path")
    .eq("id", parsed.data)
    .single();

  if (logError || !log?.audio_path) return { ok: false, error: "Recording not found." };

  const { data, error } = await supabase.storage
    .from("recordings")
    .createSignedUrl(log.audio_path, 3600);

  if (error || !data) return { ok: false, error: "Could not create signed URL." };

  return { ok: true, data: data.signedUrl };
}

const peaksSchema = z.array(z.number().min(0).max(1)).min(20).max(400);

export async function saveWaveformPeaks(logId: string, peaks: number[]): Promise<ActionResult> {
  const parsedId = uuid.safeParse(logId);
  const parsedPeaks = peaksSchema.safeParse(peaks);
  if (!parsedId.success || !parsedPeaks.success) return { ok: false, error: "Invalid input." };

  const rounded = parsedPeaks.data.map((n) => Math.round(n * 1000) / 1000);

  const supabase = await createClient();
  const { error } = await supabase
    .from("logs")
    .update({ waveform_peaks: rounded })
    .eq("id", parsedId.data)
    .is("waveform_peaks", null);

  // Silently no-op on RLS denial (worker viewing someone else's log, etc.) — this is a
  // best-effort cache write, not a user-facing mutation.
  if (error) return { ok: true };

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function addTag(logId: string, tagId: string): Promise<ActionResult> {
  const parsedLog = uuid.safeParse(logId);
  const parsedTag = uuid.safeParse(tagId);
  if (!parsedLog.success || !parsedTag.success) return { ok: false, error: "Invalid input." };

  const supabase = await createClient();
  const { error } = await supabase.from("log_tags").insert({ log_id: parsedLog.data, tag_id: parsedTag.data });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function removeTag(logId: string, tagId: string): Promise<ActionResult> {
  const parsedLog = uuid.safeParse(logId);
  const parsedTag = uuid.safeParse(tagId);
  if (!parsedLog.success || !parsedTag.success) return { ok: false, error: "Invalid input." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("log_tags")
    .delete()
    .eq("log_id", parsedLog.data)
    .eq("tag_id", parsedTag.data);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}

const createTagSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #146c44."),
});

export async function createTag(name: string, color: string): Promise<ActionResult<Tag>> {
  const parsed = createTagSchema.safeParse({ name, color });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid tag." };
  }

  const supabase = await createClient();
  const { data: profile } = await supabase.auth.getClaims();
  const userId = profile?.claims?.sub;
  if (!userId) return { ok: false, error: "Not authenticated." };

  const { data: viewerProfile } = await supabase.from("profiles").select("farm_id, role").eq("id", userId).single();
  if (!viewerProfile) return { ok: false, error: "Not authenticated." };
  if (viewerProfile.role !== "admin" && viewerProfile.role !== "manager") {
    return { ok: false, error: "Only admins and managers can create tags." };
  }

  const { data, error } = await supabase
    .from("tags")
    .insert({ name: parsed.data.name, color: parsed.data.color, farm_id: viewerProfile.farm_id })
    .select("id, name, color")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Could not create tag." };

  revalidatePath("/dashboard");
  return { ok: true, data: { id: data.id, name: data.name, color: data.color ?? parsed.data.color } };
}

// updateLog ------------------------------------------------------------------

const DETAIL_STRING_FIELDS = ["product", "rate", "notes"] as const;

const updateLogSchema = z.object({
  logId: uuid,
  activity: z.enum(ACTIVITY_TYPES).optional(),
  fieldId: uuid.nullable().optional(),
  startedAt: z.iso.datetime({ offset: true }).optional(),
  endedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  product: z.string().trim().max(120).nullable().optional(),
  rate: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export type UpdateLogInput = z.infer<typeof updateLogSchema>;
export type UpdateLogResult = { ok: true; unchanged?: boolean } | { ok: false; error: string };

/**
 * Correct a log's activity/field/time/product/rate/notes. Admin/manager only, checked here
 * (with a clear user-facing message) *in addition to* the `logs_admin_manager_update` RLS
 * policy — RLS is still the actual enforcement point, this is just a friendlier failure mode
 * than a bare RLS error.
 *
 * Every write is diffed against the current row first: only columns that actually changed are
 * sent to `logs.update`, and the same diff is recorded as a `log_edits` audit row in the same
 * request. A DB function/transaction would guarantee the update and the audit insert happen
 * atomically; doing both from the server action (as here) is the pragmatic choice for this
 * app's size, not a stronger guarantee — if the audit insert fails after the update succeeds,
 * this returns an error rather than pretending the correction was fully recorded.
 */
export async function updateLog(input: UpdateLogInput): Promise<UpdateLogResult> {
  const parsed = updateLogSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "Not authenticated." };

  const { data: viewerProfile } = await supabase.from("profiles").select("farm_id, role").eq("id", userId).single();
  if (!viewerProfile) return { ok: false, error: "Not authenticated." };
  if (viewerProfile.role !== "admin" && viewerProfile.role !== "manager") {
    return { ok: false, error: "Only farm admins can correct a log." };
  }

  const { data: current } = await supabase
    .from("logs")
    .select("id, farm_id, activity, field_id, started_at, ended_at, details")
    .eq("id", data.logId)
    .eq("farm_id", viewerProfile.farm_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "Log not found." };

  if (data.fieldId) {
    const { data: field } = await supabase
      .from("fields")
      .select("id")
      .eq("id", data.fieldId)
      .eq("farm_id", viewerProfile.farm_id)
      .maybeSingle();
    if (!field) return { ok: false, error: "Selected field could not be found on this farm." };
  }

  const finalStartedAt = data.startedAt ?? current.started_at;
  const finalEndedAt = data.endedAt !== undefined ? data.endedAt : current.ended_at;
  if (finalEndedAt && new Date(finalEndedAt) < new Date(finalStartedAt)) {
    return { ok: false, error: "End time must be after start time." };
  }

  // changes: {column -> {from, to}}, the shape stored verbatim in log_edits.changes.
  const changes: Record<string, { from: Json; to: Json }> = {};
  const update: LogsUpdate = {};

  if (data.activity !== undefined && data.activity !== current.activity) {
    changes.activity = { from: current.activity, to: data.activity };
    update.activity = data.activity;
  }
  if (data.fieldId !== undefined && data.fieldId !== current.field_id) {
    changes.field_id = { from: current.field_id, to: data.fieldId };
    update.field_id = data.fieldId;
  }
  if (data.startedAt !== undefined && new Date(data.startedAt).getTime() !== new Date(current.started_at).getTime()) {
    changes.started_at = { from: current.started_at, to: data.startedAt };
    update.started_at = data.startedAt;
  }
  if (data.endedAt !== undefined) {
    const currentEndedMs = current.ended_at ? new Date(current.ended_at).getTime() : null;
    const nextEndedMs = data.endedAt ? new Date(data.endedAt).getTime() : null;
    if (nextEndedMs !== currentEndedMs) {
      changes.ended_at = { from: current.ended_at, to: data.endedAt };
      update.ended_at = data.endedAt;
    }
  }

  const details = { ...((current.details as Record<string, unknown>) ?? {}) };
  let detailsChanged = false;
  for (const key of DETAIL_STRING_FIELDS) {
    const input = data[key];
    if (input === undefined) continue; // not provided — leave this key untouched
    const oldVal = typeof details[key] === "string" ? (details[key] as string) : null;
    const newVal = input === null || input === "" ? null : input;
    if (newVal === oldVal) continue;
    changes[key] = { from: oldVal, to: newVal };
    detailsChanged = true;
    if (newVal === null) delete details[key];
    else details[key] = newVal;
  }
  if (detailsChanged) update.details = details as Json;

  if (Object.keys(changes).length === 0) {
    return { ok: true, unchanged: true };
  }

  update.corrected_at = new Date().toISOString();
  update.corrected_by = userId;

  const { error: updateError } = await supabase.from("logs").update(update).eq("id", data.logId);
  if (updateError) return { ok: false, error: updateError.message };

  const { error: auditError } = await supabase
    .from("log_edits")
    .insert({ log_id: data.logId, edited_by: userId, changes });
  if (auditError) {
    return { ok: false, error: `Log was updated, but the audit record failed to save: ${auditError.message}` };
  }

  revalidatePath("/dashboard");
  revalidatePath("/activity-logs");
  return { ok: true };
}
