"use client";

import { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";

const WAVEFORM_HEIGHT = 81;

/**
 * Cheap, content-based identity for a peaks array so the create-effect can detect a real change
 * in the underlying waveform data without re-firing every time `peaks` gets a new array identity
 * (e.g. after a `router.refresh()` following `saveWaveformPeaks`).
 */
function peaksKey(peaks: number[] | null): string {
  if (!peaks || peaks.length === 0) return "none";
  let checksum = 0;
  const step = Math.max(1, Math.floor(peaks.length / 32));
  for (let i = 0; i < peaks.length; i += step) {
    checksum = (checksum + Math.round(peaks[i] * 1000)) | 0;
  }
  return `${peaks.length}:${checksum}`;
}

export default function Waveform({
  peaks,
  duration,
  url,
  playing,
  onPlayingChange,
  onDecoded,
}: {
  peaks: number[] | null;
  duration: number | null;
  /** Signed audio URL. When null, renders static bars from `peaks` and playback is disabled. */
  url: string | null;
  playing: boolean;
  onPlayingChange?: (playing: boolean) => void;
  /** Called once with normalized (0..1) peaks after wavesurfer decodes `url` — only when `peaks` was null. */
  onDecoded?: (peaks: number[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const readyRef = useRef(false);

  // Keep the latest callbacks/playing state in refs so the create-effect below never has to
  // depend on them (and therefore never recreates the instance because of them). Updated in an
  // effect (not during render) since mutating a ref while rendering is disallowed.
  const playingRef = useRef(playing);
  const onPlayingChangeRef = useRef(onPlayingChange);
  const onDecodedRef = useRef(onDecoded);
  useEffect(() => {
    playingRef.current = playing;
    onPlayingChangeRef.current = onPlayingChange;
    onDecodedRef.current = onDecoded;
  });

  // Once a `url`-backed instance exists, WaveSurfer decodes the real audio itself — `peaks` is
  // only ever used as the initial static-render hint, so a later identity change to `peaks`
  // (e.g. peaks arriving from the server after `saveWaveformPeaks` + router.refresh()) must NOT
  // recreate the instance mid-playback. Only in peaks-only mode (no url) does a genuine content
  // change to `peaks` need to redraw the bars.
  const key = url ? "url" : peaksKey(peaks);

  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      height: WAVEFORM_HEIGHT,
      waveColor: "rgba(1, 56, 47, 0.25)",
      progressColor: "#003930",
      cursorColor: "#003930",
      cursorWidth: 2,
      barWidth: 2,
      barGap: 4,
      barRadius: 2,
      normalize: true,
      interact: Boolean(url),
      dragToSeek: Boolean(url),
      url: url ?? undefined,
      peaks: peaks ? [peaks] : undefined,
      duration: duration ?? undefined,
    });
    wavesurferRef.current = ws;
    readyRef.current = false;

    const handlePlay = () => onPlayingChangeRef.current?.(true);
    const handlePause = () => onPlayingChangeRef.current?.(false);
    const handleFinish = () => {
      onPlayingChangeRef.current?.(false);
      ws.setTime(0);
    };
    const handleReady = () => {
      readyRef.current = true;
      if (!peaks && url && onDecodedRef.current) {
        const [channel] = ws.exportPeaks({ channels: 1, maxLength: 120 });
        onDecodedRef.current((channel ?? []).map((value) => Math.min(1, Math.abs(value))));
      }
      // If playback was requested (e.g. the user hit Play before this instance was ready, or we
      // just recreated the instance for a new `url` while `playing` was already true), start it
      // now instead of leaving the UI stuck showing "Pause" with no audio actually playing.
      if (url && playingRef.current) {
        ws.play().catch(() => onPlayingChangeRef.current?.(false));
      }
    };
    ws.on("play", handlePlay);
    ws.on("pause", handlePause);
    ws.on("finish", handleFinish);
    ws.on("ready", handleReady);

    return () => {
      ws.un("play", handlePlay);
      ws.un("pause", handlePause);
      ws.un("finish", handleFinish);
      ws.un("ready", handleReady);
      ws.destroy();
      wavesurferRef.current = null;
      readyRef.current = false;
    };
    // `key` stands in for `peaks` (see above) and callbacks are read from refs, so this only
    // recreates the instance when the actual audio source (`url`/`duration`) or, in peaks-only
    // mode, the peaks content genuinely changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, duration, key]);

  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws || !url || !readyRef.current) return;
    if (playing) {
      ws.play().catch(() => onPlayingChangeRef.current?.(false));
    } else {
      ws.pause();
    }
  }, [playing, url]);

  return <div ref={containerRef} style={{ height: WAVEFORM_HEIGHT }} className="w-full" />;
}
