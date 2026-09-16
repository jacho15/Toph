"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Tag } from "@/lib/types";

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
