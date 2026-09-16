/** Client-side audio processing helpers for the voice recorder. Browser-only (uses AudioContext). */

const WHISPER_SAMPLE_RATE = 16000;

/** Decodes a recorded/uploaded audio blob into an AudioBuffer. */
export async function decodeAudioBlob(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new AudioContextCtor();
  try {
    return await context.decodeAudioData(arrayBuffer);
  } finally {
    await context.close();
  }
}

/** Downmixes to mono and resamples to 16 kHz — the format Whisper expects. */
export async function resampleTo16kMono(buffer: AudioBuffer): Promise<Float32Array> {
  const durationS = buffer.duration;
  const offlineContext = new OfflineAudioContext(1, Math.ceil(durationS * WHISPER_SAMPLE_RATE), WHISPER_SAMPLE_RATE);
  const source = offlineContext.createBufferSource();
  source.buffer = buffer;

  // OfflineAudioContext automatically downmixes a multi-channel source down to the
  // destination's channel count (1 here), so connecting directly is enough.
  source.connect(offlineContext.destination);
  source.start(0);

  const rendered = await offlineContext.startRendering();
  return rendered.getChannelData(0).slice();
}

/** Computes `bucketCount` normalized (max = 1) peaks — max abs sample per bucket — plus duration in seconds. */
export function computePeaks(buffer: AudioBuffer, bucketCount = 120): { peaks: number[]; duration: number } {
  const channelCount = buffer.numberOfChannels;
  const length = buffer.length;
  const bucketSize = Math.max(1, Math.floor(length / bucketCount));
  const rawPeaks: number[] = [];

  const channels: Float32Array[] = [];
  for (let c = 0; c < channelCount; c++) channels.push(buffer.getChannelData(c));

  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const start = bucket * bucketSize;
    const end = bucket === bucketCount - 1 ? length : Math.min(length, start + bucketSize);
    let max = 0;
    for (let i = start; i < end; i++) {
      let sample = 0;
      for (let c = 0; c < channelCount; c++) sample += Math.abs(channels[c][i] ?? 0);
      sample /= channelCount;
      if (sample > max) max = sample;
    }
    rawPeaks.push(max);
  }

  const peakMax = Math.max(...rawPeaks, 1e-6);
  const peaks = rawPeaks.map((p) => Math.min(1, p / peakMax));

  return { peaks, duration: buffer.duration };
}

/** Picks a MediaRecorder mimeType supported by this browser, preferring opus-in-webm. */
export function pickRecorderMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return undefined;
}

/** Maps a recorded/uploaded audio mime type to a storage file extension. */
export function extensionForMime(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}
