"use client";

import { Expand, Pause, Play, Plus, Star, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Waveform from "./Waveform";
import { addTag, createTag, getAudioUrl, removeTag, saveWaveformPeaks } from "@/app/actions/logs";
import type { LogFeedRow, Tag, Viewer } from "@/lib/types";

const FieldMap = dynamic(() => import("./FieldMap"), {
  ssr: false,
  loading: () => <div className="h-[335px] w-full animate-pulse rounded-[14px] bg-border-subtle" />,
});

export default function ExpandedLog({
  log,
  availableTags,
  viewerRole,
}: {
  log: LogFeedRow;
  availableTags: Tag[];
  viewerRole: Viewer["role"];
}) {
  const router = useRouter();
  const canManageTags = viewerRole === "admin" || viewerRole === "manager";

  const [playing, setPlaying] = useState(false);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [logTags, setLogTags] = useState<Tag[]>(log.tags);
  const [prevLogTags, setPrevLogTags] = useState<Tag[]>(log.tags);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#146c44");
  const [tagError, setTagError] = useState<string | null>(null);
  const tagPopoverRef = useRef<HTMLDivElement>(null);

  // Re-sync local (optimistic) tag state whenever fresh server data for this log arrives
  // (e.g. after router.refresh()) — adjusted during render per React's guidance, not in an effect.
  if (log.tags !== prevLogTags) {
    setPrevLogTags(log.tags);
    setLogTags(log.tags);
  }

  useEffect(() => {
    if (!log.audio_path) return;
    let cancelled = false;
    getAudioUrl(log.id).then((result) => {
      if (!cancelled && result.ok) setAudioUrl(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [log.id, log.audio_path]);

  // Guard against saving decoded peaks more than once for the same log — the `ready` event can
  // fire again (e.g. StrictMode double-invoke, or the Waveform instance being recreated for a
  // reason unrelated to this log) and we only ever want one `saveWaveformPeaks` call per log.
  const decodedLogIdRef = useRef<string | null>(null);

  const handleDecoded = useCallback(
    (peaks: number[]) => {
      if (decodedLogIdRef.current === log.id) return;
      decodedLogIdRef.current = log.id;
      void saveWaveformPeaks(log.id, peaks);
    },
    [log.id]
  );

  const canPlay = Boolean(audioUrl);

  useEffect(() => {
    if (!tagPopoverOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!tagPopoverRef.current?.contains(event.target as Node)) {
        setTagPopoverOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setTagPopoverOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [tagPopoverOpen]);

  useEffect(() => {
    if (!mapOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMapOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mapOpen]);

  const untaggedOptions = availableTags.filter((tag) => !logTags.some((t) => t.id === tag.id));

  async function handleAddTag(tagId: string) {
    const tag = availableTags.find((t) => t.id === tagId);
    if (!tag) return;
    setTagError(null);
    setLogTags((prev) => [...prev, tag]);
    const result = await addTag(log.id, tagId);
    if (!result.ok) {
      setLogTags((prev) => prev.filter((t) => t.id !== tagId));
      setTagError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleRemoveTag(tagId: string) {
    const removed = logTags.find((t) => t.id === tagId);
    setTagError(null);
    setLogTags((prev) => prev.filter((t) => t.id !== tagId));
    const result = await removeTag(log.id, tagId);
    if (!result.ok) {
      if (removed) setLogTags((prev) => [...prev, removed]);
      setTagError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleCreateTag(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTagError(null);
    const created = await createTag(newTagName, newTagColor);
    if (!created.ok) {
      setTagError(created.error);
      return;
    }
    setNewTagName("");
    setLogTags((prev) => [...prev, created.data]);
    const attached = await addTag(log.id, created.data.id);
    if (!attached.ok) setTagError(attached.error);
    router.refresh();
  }

  return (
    <div className="flex gap-10 p-10">
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        {log.audio_path ? (
          <Waveform
            peaks={log.waveform_peaks}
            duration={log.duration_s}
            url={audioUrl}
            playing={playing}
            onPlayingChange={setPlaying}
            onDecoded={log.waveform_peaks ? undefined : handleDecoded}
          />
        ) : (
          <div className="flex h-[81px] items-center justify-center rounded-[7.04px] border border-dashed border-ink/10 text-sm text-text-muted">
            No voice recording attached to this log
          </div>
        )}

        <button
          type="button"
          onClick={() => canPlay && setPlaying((p) => !p)}
          disabled={!canPlay}
          title={log.audio_path ? undefined : "This log has no recording"}
          className="flex h-[42px] items-center justify-center gap-[10px] rounded-[7.04px] border border-ink/10 bg-paper px-[8.8px] py-[10.56px] text-base text-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        >
          {playing ? <Pause className="h-4 w-4" strokeWidth={1.33} /> : <Play className="h-4 w-4" strokeWidth={1.33} />}
          <span>{!log.audio_path ? "No Recording" : playing ? "Pause" : "Play Recording"}</span>
        </button>

        {canManageTags ? (
          <div ref={tagPopoverRef} className="relative">
            <button
              type="button"
              onClick={() => setTagPopoverOpen((open) => !open)}
              aria-expanded={tagPopoverOpen}
              className="flex h-[42px] w-full items-center justify-center gap-[10px] rounded-[7.04px] border border-tag-green/10 bg-tag-green/10 px-[8.8px] py-[10.56px] text-base text-tag-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tag-green/40"
            >
              <Star className="h-4 w-4" strokeWidth={1.33} />
              <span>Add Tag</span>
            </button>
            {tagPopoverOpen ? (
              <div className="absolute left-0 top-[calc(100%+8px)] z-10 w-full min-w-[220px] rounded-lg border border-border-subtle bg-paper p-3 shadow-lg">
                {tagError ? <p className="mb-2 text-sm text-red-600">{tagError}</p> : null}
                {logTags.length > 0 ? (
                  <ul className="mb-2 flex flex-wrap gap-2">
                    {logTags.map((tag) => (
                      <li
                        key={tag.id}
                        className="flex items-center gap-1 rounded-full px-2 py-1 text-2xs font-medium text-paper"
                        style={{ backgroundColor: tag.color }}
                      >
                        {tag.name}
                        <button
                          type="button"
                          aria-label={`Remove ${tag.name} tag`}
                          onClick={() => handleRemoveTag(tag.id)}
                          className="focus-visible:outline-none"
                        >
                          <X className="h-3 w-3" strokeWidth={1.5} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {untaggedOptions.length > 0 ? (
                  <ul className="mb-2 flex flex-col gap-1">
                    {untaggedOptions.map((tag) => (
                      <li key={tag.id}>
                        <button
                          type="button"
                          onClick={() => handleAddTag(tag.id)}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-ink hover:bg-border-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
                        >
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} aria-hidden />
                          {tag.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mb-2 px-2 py-1.5 text-sm text-text-secondary">No more tags to add.</p>
                )}
                <form onSubmit={handleCreateTag} className="flex items-center gap-1.5 border-t border-border-subtle pt-2">
                  <input
                    type="color"
                    value={newTagColor}
                    onChange={(event) => setNewTagColor(event.target.value)}
                    aria-label="New tag color"
                    className="h-7 w-7 shrink-0 cursor-pointer rounded border border-border-default bg-transparent p-0.5"
                  />
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(event) => setNewTagName(event.target.value)}
                    placeholder="Create tag"
                    className="min-w-0 flex-1 rounded border border-border-default px-2 py-1 text-sm text-ink placeholder:text-text-placeholder focus:outline-none focus:ring-2 focus:ring-ink/40"
                  />
                  <button
                    type="submit"
                    aria-label="Create tag"
                    disabled={!newTagName.trim()}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-ink text-paper disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        ) : null}

        {logTags.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {logTags.map((tag) => (
              <li
                key={tag.id}
                className="rounded-full px-2 py-1 text-2xs font-medium text-paper"
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-col gap-1">
          <span className="text-base leading-[20.8px] text-ink">Summary</span>
          <p className="text-base leading-[20.8px] text-ink/30">{log.summary}</p>
          {log.spoken_name ? (
            <p className="text-sm text-text-secondary">Spoken name: &quot;{log.spoken_name}&quot;</p>
          ) : null}
          {log.uploaded_by && log.uploaded_by !== log.employee_id && log.uploaded_by_name ? (
            <p className="text-sm text-text-secondary">Filed by {log.uploaded_by_name}</p>
          ) : null}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <FieldMap
          boundary={log.field_boundary}
          location={log.location_geojson}
          interactive={false}
          className="h-[335px] w-full"
        />
        <button
          type="button"
          onClick={() => setMapOpen(true)}
          className="flex h-[42px] items-center justify-center gap-[10px] rounded-[7.04px] border border-ink/10 bg-paper px-[8.8px] py-[10.56px] text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        >
          <Expand className="h-4 w-4" strokeWidth={1.33} />
          <span>Expand Map</span>
        </button>
      </div>

      {mapOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Field map"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-10"
          onClick={(event) => {
            if (event.target === event.currentTarget) setMapOpen(false);
          }}
        >
          <div className="relative h-[80vh] w-[90vw] max-w-[1400px]">
            <button
              type="button"
              onClick={() => setMapOpen(false)}
              aria-label="Close map"
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-paper text-ink shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            >
              <X className="h-4 w-4" strokeWidth={1.33} />
            </button>
            <FieldMap
              boundary={log.field_boundary}
              location={log.location_geojson}
              interactive
              className="h-full w-full"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
