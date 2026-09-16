"use client";

import { Check, CircleAlert, Loader2, Mic, Square, Upload } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Waveform from "./Waveform";
import type { MainToWorkerMessage, WorkerToMainMessage } from "./whisper.worker";
import { createVoiceLog, getAiBudgetStatus } from "@/app/actions/voice-log";
import { computePeaks, decodeAudioBlob, extensionForMime, pickRecorderMimeType, resampleTo16kMono } from "@/lib/audio/process";
import { createClient } from "@/lib/supabase/client";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const GUIDED_PROMPTS = [
  "What activity did you do? (spraying, fertilizing, planting, irrigating, harvesting, scouting, pruning, soil work, equipment maintenance)",
  "Where were you working (field, block, or area)?",
  "Any products, rates, or notes?",
];

type Phase = "record" | "transcribe" | "review" | "saving" | "success";

const STEPS: { key: Phase; label: string }[] = [
  { key: "record", label: "Record" },
  { key: "transcribe", label: "Transcribe" },
  { key: "review", label: "Review" },
  { key: "saving", label: "Save" },
];

function stepIndex(phase: Phase): number {
  if (phase === "success") return STEPS.length;
  return STEPS.findIndex((s) => s.key === phase);
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function VoiceRecorder({ farmId, userId }: { farmId: string; userId: string }) {
  const [phase, setPhase] = useState<Phase>("record");

  const [isRecording, setIsRecording] = useState(false);
  const [elapsedS, setElapsedS] = useState(0);
  const [level, setLevel] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);

  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [peaks, setPeaks] = useState<number[] | null>(null);

  const [modelStatus, setModelStatus] = useState<"idle" | "loading-model" | "transcribing">("idle");
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  const [transcript, setTranscript] = useState("");

  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [saveStatus, setSaveStatus] = useState<"idle" | "uploading" | "saving">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [budgetNotice, setBudgetNotice] = useState<string | null>(null);
  const [savedLogId, setSavedLogId] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  // Non-blocking, best-effort geolocation — ignore denial/unavailability entirely.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => setLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => {},
      { maximumAge: 5 * 60 * 1000, timeout: 8000 },
    );
  }, []);

  const getWorker = useCallback((): Worker => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
    }
    return workerRef.current;
  }, []);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const runTranscription = useCallback(
    async (blob: Blob) => {
      setPhase("transcribe");
      setTranscribeError(null);
      setModelStatus("loading-model");
      setModelProgress(null);

      try {
        const buffer = await decodeAudioBlob(blob);
        const { peaks: computedPeaks, duration: computedDuration } = computePeaks(buffer);
        setPeaks(computedPeaks);
        setDuration(computedDuration);

        const mono16k = await resampleTo16kMono(buffer);
        const worker = getWorker();

        worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
          const message = event.data;
          if (message.type === "model-progress") {
            if (message.progress.status === "progress") setModelProgress(message.progress.progress);
            else if (message.progress.status === "progress_total") setModelProgress(message.progress.progress);
            else if (message.progress.status === "ready") setModelProgress(100);
          } else if (message.type === "status") {
            setModelStatus(message.status);
            if (message.status === "transcribing") setModelProgress(null);
          } else if (message.type === "result") {
            setTranscript(message.text);
            setPhase("review");
          } else if (message.type === "error") {
            setTranscribeError(message.error);
          }
        };

        const payload: MainToWorkerMessage = { type: "transcribe", audio: mono16k };
        worker.postMessage(payload, [mono16k.buffer]);
      } catch (error) {
        setTranscribeError(error instanceof Error ? error.message : "Could not process the recording.");
      }
    },
    [getWorker],
  );

  const startLevelMeter = useCallback((stream: MediaStream) => {
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioContextCtor();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    audioCtxRef.current = audioCtx;
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    const tick = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        const normalized = (data[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      frame++;
      if (frame % 3 === 0) setLevel(Math.min(1, rms * 4));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const stopLevelMeter = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  const startRecording = useCallback(async () => {
    setRecordError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordError("Recording isn't supported in this browser. Upload a recording instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickRecorderMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setAudioBlob(blob);
        void runTranscription(blob);
      };

      recorderRef.current = recorder;
      recorder.start();
      recordingStartRef.current = Date.now();
      setElapsedS(0);
      setIsRecording(true);
      startLevelMeter(stream);
      timerRef.current = setInterval(() => {
        setElapsedS(Math.floor((Date.now() - recordingStartRef.current) / 1000));
      }, 250);
    } catch {
      setRecordError("Microphone access was denied or is unavailable. You can upload a recording instead.");
    }
  }, [runTranscription, startLevelMeter]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    setIsRecording(false);
    stopLevelMeter();
    if (timerRef.current) clearInterval(timerRef.current);
  }, [stopLevelMeter]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setRecordError("That file is larger than 20 MB. Choose a smaller recording.");
      return;
    }
    setRecordError(null);
    setAudioBlob(file);
    void runTranscription(file);
  }

  async function handleSubmit() {
    if (!audioBlob) return;
    setSaveError(null);
    setBudgetNotice(null);
    setPhase("saving");
    setSaveStatus("uploading");

    try {
      // Check the AI spend budget before uploading anything, so a rate-limited
      // user is told up front instead of after paying the upload cost.
      const budgetStatus = await getAiBudgetStatus();
      if (!budgetStatus.allowed) {
        setBudgetNotice(budgetStatus.message ?? "AI processing is temporarily limited. Please try again later.");
        setPhase("review");
        return;
      }

      const logId = crypto.randomUUID();
      const ext = extensionForMime(audioBlob.type || "audio/webm");
      const audioPath = `${farmId}/${userId}/${logId}.${ext}`;

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("recordings")
        .upload(audioPath, audioBlob, { contentType: audioBlob.type || "audio/webm" });
      if (uploadError) throw new Error(uploadError.message);

      setSaveStatus("saving");
      const result = await createVoiceLog({
        logId,
        audioPath,
        audioMime: audioBlob.type || "audio/webm",
        durationS: duration,
        peaks: peaks ?? [],
        transcript,
        recordedAt: new Date().toISOString(),
        location: location ?? undefined,
      });

      if (!result.ok) {
        await supabase.storage.from("recordings").remove([audioPath]);
        if (result.code === "rate_limited") {
          setBudgetNotice(result.error);
          setPhase("review");
          return;
        }
        throw new Error(result.error);
      }

      setSavedLogId(result.data.logId);
      setPhase("success");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Something went wrong while saving.");
      setPhase("review");
    } finally {
      setSaveStatus("idle");
    }
  }

  function startOver() {
    setPhase("record");
    setAudioBlob(null);
    setDuration(0);
    setPeaks(null);
    setTranscript("");
    setTranscribeError(null);
    setModelStatus("idle");
    setModelProgress(null);
    setSaveError(null);
    setBudgetNotice(null);
    setSavedLogId(null);
    setElapsedS(0);
  }

  const currentStep = stepIndex(phase);

  return (
    <div className="flex flex-1 flex-col gap-6 rounded-[20px] border border-border-subtle bg-paper p-8">
      <ol className="flex items-center gap-3" aria-label="Progress">
        {STEPS.map((step, index) => {
          const isDone = index < currentStep;
          const isActive = index === currentStep;
          return (
            <li key={step.key} className="flex items-center gap-3">
              <span
                className={
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-2xs font-medium " +
                  (isDone
                    ? "bg-tag-green text-paper"
                    : isActive
                      ? "bg-ink text-paper"
                      : "border border-border-default text-text-muted")
                }
                aria-current={isActive ? "step" : undefined}
              >
                {isDone ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : index + 1}
              </span>
              <span className={"text-sm " + (isActive ? "font-medium text-ink" : "text-text-secondary")}>{step.label}</span>
              {index < STEPS.length - 1 ? <span className="h-px w-8 bg-border-default" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>

      {phase === "record" ? (
        <div className="flex flex-1 flex-col gap-6">
          <div className="rounded-[14px] border border-border-subtle bg-row-highlight p-5">
            <h2 className="mb-3 text-sm font-medium text-ink">While you record, cover:</h2>
            <ul className="flex flex-col gap-2">
              {GUIDED_PROMPTS.map((prompt) => (
                <li key={prompt} className="text-sm text-text-secondary">
                  {prompt}
                </li>
              ))}
            </ul>
          </div>

          {recordError ? (
            <p role="alert" className="flex items-center gap-2 text-sm text-red-600">
              <CircleAlert className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              {recordError}
            </p>
          ) : null}

          <div className="flex flex-col items-center gap-4 py-6">
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              aria-pressed={isRecording}
              className={
                "flex h-20 w-20 items-center justify-center rounded-full text-paper shadow-[0_0_4px_rgba(0,0,0,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 " +
                (isRecording ? "bg-red-600" : "bg-ink")
              }
            >
              {isRecording ? <Square className="h-7 w-7" strokeWidth={1.5} /> : <Mic className="h-8 w-8" strokeWidth={1.5} />}
              <span className="sr-only">{isRecording ? "Stop recording" : "Start recording"}</span>
            </button>

            {isRecording ? (
              <div className="flex w-full max-w-xs flex-col items-center gap-2">
                <span aria-live="polite" className="text-lg font-medium tabular-nums text-ink">
                  {formatElapsed(elapsedS)}
                </span>
                <div className="h-2 w-full overflow-hidden rounded-full bg-border-subtle" aria-hidden>
                  <div
                    className="h-full rounded-full bg-tag-green transition-[width] duration-100"
                    style={{ width: `${Math.round(level * 100)}%` }}
                  />
                </div>
                <span className="sr-only" role="status">
                  Input level {Math.round(level * 100)} percent
                </span>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-3 border-t border-border-subtle pt-5">
            <label className="flex h-[34px] cursor-pointer items-center gap-2 rounded-[80px] border border-border-default bg-paper px-4 text-sm text-text-secondary shadow-[0_0_4px_rgba(0,0,0,0.05)] hover:text-ink focus-within:outline-none focus-within:ring-2 focus-within:ring-ink/40">
              <Upload className="h-4 w-4" strokeWidth={1.33} />
              <span>Upload a recording instead</span>
              <input type="file" accept="audio/*" onChange={handleFileChange} className="sr-only" />
            </label>
            <span className="text-2xs text-text-faint">Up to 20 MB</span>
          </div>
        </div>
      ) : null}

      {phase === "transcribe" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-ink" strokeWidth={1.5} />
          <p className="text-base text-ink">
            {modelStatus === "loading-model" ? "Downloading the transcription model…" : "Transcribing your recording…"}
          </p>
          {modelStatus === "loading-model" && modelProgress != null ? (
            <div className="h-2 w-64 overflow-hidden rounded-full bg-border-subtle">
              <div className="h-full rounded-full bg-ink" style={{ width: `${Math.round(modelProgress)}%` }} />
            </div>
          ) : null}
          <p className="max-w-sm text-sm text-text-secondary">
            This runs locally in your browser — the model downloads once and is cached for next time.
          </p>
          {transcribeError ? (
            <div className="flex flex-col items-center gap-3">
              <p role="alert" className="flex items-center gap-2 text-sm text-red-600">
                <CircleAlert className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                {transcribeError}
              </p>
              <button
                type="button"
                onClick={() => audioBlob && runTranscription(audioBlob)}
                className="flex h-[34px] items-center gap-[10px] rounded-[80px] bg-ink px-4 text-sm text-paper shadow-[0_0_4px_rgba(0,0,0,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper"
              >
                Try again
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {phase === "review" ? (
        <div className="flex flex-1 flex-col gap-4">
          {peaks && duration ? <Waveform peaks={peaks} duration={duration} url={null} playing={false} /> : null}

          <label htmlFor="transcript" className="text-sm font-medium text-ink">
            Transcript
          </label>
          <p className="-mt-2 text-sm text-text-secondary">
            Whisper isn&apos;t always perfect — fix anything it misheard before saving.
          </p>
          <textarea
            id="transcript"
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            rows={6}
            className="w-full rounded-[14px] border border-border-default p-4 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/40"
          />

          {budgetNotice ? (
            <p role="status" className="rounded-[10px] bg-row-highlight px-4 py-3 text-sm text-text-secondary">
              {budgetNotice}
            </p>
          ) : null}

          {saveError ? (
            <p role="alert" className="flex items-center gap-2 text-sm text-red-600">
              <CircleAlert className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              {saveError}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!transcript.trim()}
              className="flex h-[42px] items-center gap-[10px] rounded-[80px] bg-ink px-6 text-sm text-paper shadow-[0_0_4px_rgba(0,0,0,0.05)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper"
            >
              Submit
            </button>
            <button
              type="button"
              onClick={startOver}
              className="flex h-[42px] items-center gap-[10px] rounded-[80px] border border-border-default bg-paper px-6 text-sm text-text-secondary shadow-[0_0_4px_rgba(0,0,0,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            >
              Start over
            </button>
          </div>
        </div>
      ) : null}

      {phase === "saving" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-ink" strokeWidth={1.5} />
          <p className="text-base text-ink">
            {saveStatus === "uploading" ? "Uploading recording…" : "Saving your log…"}
          </p>
        </div>
      ) : null}

      {phase === "success" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-tag-green/10 text-tag-green">
            <Check className="h-7 w-7" strokeWidth={1.5} />
          </span>
          <p className="text-lg font-medium text-ink">Voice log saved</p>
          <p className="max-w-sm text-sm text-text-secondary">Toph transcribed and filled in the details automatically.</p>
          <div className="flex items-center gap-3">
            <Link
              href={savedLogId ? `/dashboard?open=${savedLogId}` : "/dashboard"}
              className="flex h-[42px] items-center gap-[10px] rounded-[80px] bg-ink px-6 text-sm text-paper shadow-[0_0_4px_rgba(0,0,0,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper"
            >
              View on dashboard
            </Link>
            <button
              type="button"
              onClick={startOver}
              className="flex h-[42px] items-center gap-[10px] rounded-[80px] border border-border-default bg-paper px-6 text-sm text-text-secondary shadow-[0_0_4px_rgba(0,0,0,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            >
              Record another
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
