"use client";

import { Check, CircleAlert, Loader2, Mic, Square, Upload } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Waveform from "./Waveform";
import type { MainToWorkerMessage, WorkerToMainMessage } from "./whisper.worker";
import {
  createVoiceLog,
  prepareVoiceLog,
  searchPersonCandidates,
  type AssignablePerson,
  type PersonCandidate,
  type VoiceLogSuggestion,
} from "@/app/actions/voice-log";
import { computePeaks, decodeAudioBlob, extensionForMime, pickRecorderMimeType, resampleTo16kMono } from "@/lib/audio/process";
import { createClient } from "@/lib/supabase/client";
import type { VoiceLogExtraction } from "@/lib/ai/extract-voice-log";
import type { Viewer } from "@/lib/types";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const GUIDED_PROMPTS = [
  "What activity did you do? (spraying, fertilizing, planting, irrigating, harvesting, scouting, pruning, soil work, equipment maintenance)",
  "Where were you working (field, block, or area)?",
  "Any products, rates, or notes?",
];

type Phase = "record" | "transcribe" | "review" | "identify" | "saving" | "success";

type Attribution =
  | { kind: "none" }
  | { kind: "self" }
  | { kind: "profile"; id: string }
  | { kind: "crew"; id: string }
  | { kind: "new_crew"; fullName: string };

const STEPS: { key: Phase; label: string }[] = [
  { key: "record", label: "Record" },
  { key: "transcribe", label: "Transcribe" },
  { key: "review", label: "Review" },
  { key: "identify", label: "Identify" },
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

export default function VoiceRecorder({
  farmId,
  userId,
  viewerRole,
  viewerName,
}: {
  farmId: string;
  userId: string;
  viewerRole: Viewer["role"];
  viewerName: string;
}) {
  const isAdminOrManager = viewerRole === "admin" || viewerRole === "manager";
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

  const [identifying, setIdentifying] = useState(false);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<VoiceLogExtraction | null>(null);
  const [suggestion, setSuggestion] = useState<VoiceLogSuggestion | null>(null);
  const [attribution, setAttribution] = useState<Attribution | null>(null);
  const [expandedCandidates, setExpandedCandidates] = useState<PersonCandidate[] | null>(null);
  const [expandQuery, setExpandQuery] = useState("");
  const [expanding, setExpanding] = useState(false);
  const [assignablePeople, setAssignablePeople] = useState<AssignablePerson[] | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const recordedAtRef = useRef<string | null>(null);

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

  /**
   * Uploads the recording and saves the log with the given attribution. `extractionData`
   * is passed straight through to `createVoiceLog`, which re-validates it server-side — see
   * the comment on `createVoiceLog` for why round-tripping it through the client is safe.
   */
  async function proceedToSave(
    extractionData: VoiceLogExtraction,
    chosenAttribution: Attribution,
    recordedAt: string,
    errorPhase: "review" | "identify",
  ) {
    if (!audioBlob) return;
    setSaveError(null);
    setIdentifyError(null);
    setPhase("saving");
    setSaveStatus("uploading");

    try {
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
        recordedAt,
        location: location ?? undefined,
        extraction: extractionData,
        attribution: chosenAttribution,
      });

      if (!result.ok) {
        await supabase.storage.from("recordings").remove([audioPath]);
        if (result.code === "rate_limited") {
          setBudgetNotice(result.error);
          setPhase(errorPhase);
          return;
        }
        throw new Error(result.error);
      }

      setSavedLogId(result.data.logId);
      setPhase("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong while saving.";
      if (errorPhase === "identify") setIdentifyError(message);
      else setSaveError(message);
      setPhase(errorPhase);
    } finally {
      setSaveStatus("idle");
    }
  }

  /**
   * Submit from the Review step. Runs the (budget-checked) Claude extraction before any
   * upload happens, so a denied budget or a failed extraction costs nothing.
   *
   * For a worker, when the spoken name resolves unambiguously (no name spoken, or a
   * confident self-match) this proceeds straight to saving; otherwise it stops on the
   * Identify step for the worker to confirm who the log is for.
   *
   * For an admin/manager, this always stops on the Identify step and always requires an
   * explicit choice — an admin/manager upload with nobody chosen would silently file the log
   * under the admin, so there's no auto-proceed path here regardless of match confidence.
   */
  async function handleIdentify() {
    if (!audioBlob) return;
    setSaveError(null);
    setBudgetNotice(null);
    setIdentifyError(null);
    setExtraction(null);
    setSuggestion(null);
    setAttribution(null);
    setExpandedCandidates(null);
    setExpandQuery("");
    setAssignablePeople(null);
    setPickerQuery("");
    setPhase("identify");
    setIdentifying(true);

    try {
      const recordedAt = new Date().toISOString();
      recordedAtRef.current = recordedAt;
      const result = await prepareVoiceLog({ transcript, recordedAt });

      if (!result.ok) {
        if (result.code === "rate_limited") setBudgetNotice(result.error);
        else setSaveError(result.error);
        setPhase("review");
        return;
      }

      setExtraction(result.extraction);
      setSuggestion(result.suggestion);
      setAssignablePeople(result.assignablePeople ?? null);

      if (isAdminOrManager) {
        // Never auto-proceed — always require an explicit pick on the Identify step below.
        return;
      }

      if (result.suggestion.mode === "none") {
        await proceedToSave(result.extraction, { kind: "none" }, recordedAt, "review");
      } else if (result.suggestion.mode === "self") {
        await proceedToSave(result.extraction, { kind: "self" }, recordedAt, "review");
      } else if (result.suggestion.mode === "candidates") {
        const first = result.suggestion.candidates.find((c) => !c.isSelf) ?? result.suggestion.candidates[0];
        setAttribution(first ? { kind: first.kind, id: first.id } : { kind: "self" });
      } else {
        setAttribution({ kind: "new_crew", fullName: result.suggestion.spokenName });
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Something went wrong while identifying this log.");
      setPhase("review");
    } finally {
      setIdentifying(false);
    }
  }

  function confirmIdentify() {
    if (!extraction || !attribution || !recordedAtRef.current) return;
    void proceedToSave(extraction, attribution, recordedAtRef.current, "identify");
  }

  async function expandCandidates() {
    if (!expandQuery.trim()) return;
    setExpanding(true);
    setIdentifyError(null);
    try {
      const result = await searchPersonCandidates(expandQuery.trim());
      if (!result.ok) {
        setIdentifyError(result.error);
        return;
      }
      setExpandedCandidates(result.data);
    } finally {
      setExpanding(false);
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
    setIdentifying(false);
    setIdentifyError(null);
    setExtraction(null);
    setSuggestion(null);
    setAttribution(null);
    setExpandedCandidates(null);
    setExpandQuery("");
    setAssignablePeople(null);
    setPickerQuery("");
    recordedAtRef.current = null;
  }

  const currentStep = stepIndex(phase);

  // Admin/manager Identify step only: unify every suggestion mode into one candidate list (a
  // synthetic self-candidate for "self", none for "none") so the picker below always has the
  // same shape to render, regardless of which mode `prepareVoiceLog` returned.
  const adminSpokenName = suggestion && suggestion.mode !== "none" ? suggestion.spokenName : null;
  const adminMatchedCandidates: PersonCandidate[] =
    suggestion?.mode === "candidates" || suggestion?.mode === "new_person"
      ? suggestion.candidates
      : suggestion?.mode === "self"
        ? [{ kind: "profile", id: userId, fullName: suggestion.selfName, isSelf: true }]
        : [];
  const adminNonSelfMatches = adminMatchedCandidates.filter((candidate) => !candidate.isSelf);
  const adminSelfName = adminMatchedCandidates.find((candidate) => candidate.isSelf)?.fullName ?? viewerName;
  const adminFilteredRoster = (assignablePeople ?? []).filter(
    (person) => person.id !== userId && person.fullName.toLowerCase().includes(pickerQuery.trim().toLowerCase()),
  );

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
            <h2 className="mb-3 text-sm font-medium text-ink">
              {isAdminOrManager ? "The recording should cover:" : "While you record, cover:"}
            </h2>
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

          {isAdminOrManager ? (
            <>
              <div className="flex flex-col items-center gap-3 rounded-[14px] border-2 border-dashed border-border-default bg-row-highlight/60 px-6 py-10 text-center">
                <Upload className="h-8 w-8 text-ink" strokeWidth={1.33} />
                <label
                  htmlFor="admin-audio-upload"
                  className="cursor-pointer rounded-[80px] bg-ink px-6 py-2 text-sm text-paper shadow-[0_0_4px_rgba(0,0,0,0.05)] focus-within:outline-none focus-within:ring-2 focus-within:ring-ink/40"
                >
                  Upload a recording
                </label>
                <input id="admin-audio-upload" type="file" accept="audio/*" onChange={handleFileChange} className="sr-only" />
                <span className="text-2xs text-text-faint">Up to 20 MB</span>
              </div>

              <div className="flex flex-col items-center gap-3 border-t border-border-subtle pt-5">
                <span className="text-sm text-text-secondary">or record with your microphone</span>
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  aria-pressed={isRecording}
                  className={
                    "flex h-14 w-14 items-center justify-center rounded-full shadow-[0_0_4px_rgba(0,0,0,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 " +
                    (isRecording ? "bg-red-600 text-paper" : "border border-border-default bg-paper text-ink")
                  }
                >
                  {isRecording ? <Square className="h-5 w-5" strokeWidth={1.5} /> : <Mic className="h-5 w-5" strokeWidth={1.5} />}
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
            </>
          ) : (
            <>
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
            </>
          )}
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
              onClick={handleIdentify}
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

      {phase === "identify" ? (
        <div className="flex flex-1 flex-col gap-4">
          {identifying ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center" aria-live="polite">
              <Loader2 className="h-8 w-8 animate-spin text-ink" strokeWidth={1.5} />
              <p className="text-base text-ink">Identifying who this log is for…</p>
            </div>
          ) : isAdminOrManager && suggestion ? (
            <>
              <h2 className="text-sm font-medium text-ink">
                {adminSpokenName
                  ? `We heard "${adminSpokenName}" — who is this log for?`
                  : "No name detected in this recording — choose who it belongs to"}
              </h2>

              <fieldset className="flex flex-col gap-2">
                <legend className="sr-only">Who is this log for?</legend>

                {adminNonSelfMatches.map((candidate) => (
                  <label
                    key={`${candidate.kind}-${candidate.id}`}
                    className="flex items-center gap-3 rounded-[14px] border border-border-default p-3 text-sm text-ink focus-within:ring-2 focus-within:ring-ink/40"
                  >
                    <input
                      type="radio"
                      name="attribution"
                      checked={attribution?.kind === candidate.kind && attribution.id === candidate.id}
                      onChange={() => setAttribution({ kind: candidate.kind, id: candidate.id })}
                    />
                    {candidate.fullName}
                    <span className="text-text-faint">{candidate.kind === "profile" ? "worker" : "crew member"}</span>
                  </label>
                ))}

                <label className="flex items-center gap-3 rounded-[14px] border border-border-default p-3 text-sm text-ink focus-within:ring-2 focus-within:ring-ink/40">
                  <input
                    type="radio"
                    name="attribution"
                    checked={attribution?.kind === "self"}
                    onChange={() => setAttribution({ kind: "self" })}
                  />
                  It&apos;s me ({adminSelfName})
                </label>

                {adminSpokenName ? (
                  <label className="flex items-center gap-3 rounded-[14px] border border-border-default p-3 text-sm text-ink focus-within:ring-2 focus-within:ring-ink/40">
                    <input
                      type="radio"
                      name="attribution"
                      checked={attribution?.kind === "new_crew"}
                      onChange={() => setAttribution({ kind: "new_crew", fullName: adminSpokenName })}
                    />
                    Add &quot;{adminSpokenName}&quot; as a new crew member
                  </label>
                ) : null}
              </fieldset>

              <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
                <p className="text-sm text-text-secondary">Or choose from the farm roster:</p>
                <input
                  type="text"
                  value={pickerQuery}
                  onChange={(event) => setPickerQuery(event.target.value)}
                  placeholder="Search workers"
                  aria-label="Search the farm roster"
                  className="w-full rounded-[10px] border border-border-default px-3 py-2 text-sm text-ink placeholder:text-text-placeholder focus:outline-none focus:ring-2 focus:ring-ink/40"
                />
                {adminFilteredRoster.length === 0 ? (
                  <p className="text-sm text-text-secondary">No matches on the farm roster.</p>
                ) : (
                  <fieldset className="flex max-h-56 flex-col gap-2 overflow-y-auto">
                    <legend className="sr-only">Farm roster</legend>
                    {adminFilteredRoster.map((person) => (
                      <label
                        key={person.id}
                        className="flex items-center gap-3 rounded-[14px] border border-border-default p-3 text-sm text-ink focus-within:ring-2 focus-within:ring-ink/40"
                      >
                        <input
                          type="radio"
                          name="attribution"
                          checked={attribution?.kind === "profile" && attribution.id === person.id}
                          onChange={() => setAttribution({ kind: "profile", id: person.id })}
                        />
                        {person.fullName}
                        <span className="text-text-faint">{person.role}</span>
                      </label>
                    ))}
                  </fieldset>
                )}
              </div>

              {identifyError ? (
                <p role="alert" className="flex items-center gap-2 text-sm text-red-600">
                  <CircleAlert className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  {identifyError}
                </p>
              ) : null}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={confirmIdentify}
                  disabled={!attribution}
                  className="flex h-[42px] items-center gap-[10px] rounded-[80px] bg-ink px-6 text-sm text-paper shadow-[0_0_4px_rgba(0,0,0,0.05)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper"
                >
                  Confirm &amp; Save
                </button>
                <button
                  type="button"
                  onClick={() => setPhase("review")}
                  className="flex h-[42px] items-center gap-[10px] rounded-[80px] border border-border-default bg-paper px-6 text-sm text-text-secondary shadow-[0_0_4px_rgba(0,0,0,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
                >
                  Edit transcript
                </button>
              </div>
            </>
          ) : !isAdminOrManager && suggestion && (suggestion.mode === "candidates" || suggestion.mode === "new_person") ? (
            <>
              <h2 className="text-sm font-medium text-ink">
                {suggestion.mode === "candidates"
                  ? `We heard "${suggestion.spokenName}" — who is this log for?`
                  : `We heard "${suggestion.spokenName}", who isn't on the farm roster yet.`}
              </h2>

              <fieldset className="flex flex-col gap-2">
                <legend className="sr-only">Who is this log for?</legend>

                {suggestion.mode === "new_person" ? (
                  <label className="flex items-center gap-3 rounded-[14px] border border-border-default p-3 text-sm text-ink focus-within:ring-2 focus-within:ring-ink/40">
                    <input
                      type="radio"
                      name="attribution"
                      checked={attribution?.kind === "new_crew"}
                      onChange={() => setAttribution({ kind: "new_crew", fullName: suggestion.spokenName })}
                    />
                    Add &quot;{suggestion.spokenName}&quot; as a new crew member
                  </label>
                ) : null}

                {suggestion.candidates
                  .filter((candidate) => !candidate.isSelf)
                  .map((candidate) => (
                    <label
                      key={`${candidate.kind}-${candidate.id}`}
                      className="flex items-center gap-3 rounded-[14px] border border-border-default p-3 text-sm text-ink focus-within:ring-2 focus-within:ring-ink/40"
                    >
                      <input
                        type="radio"
                        name="attribution"
                        checked={attribution?.kind === candidate.kind && attribution.id === candidate.id}
                        onChange={() => setAttribution({ kind: candidate.kind, id: candidate.id })}
                      />
                      {candidate.fullName}
                      <span className="text-text-faint">{candidate.kind === "profile" ? "worker" : "crew member"}</span>
                    </label>
                  ))}

                <label className="flex items-center gap-3 rounded-[14px] border border-border-default p-3 text-sm text-ink focus-within:ring-2 focus-within:ring-ink/40">
                  <input
                    type="radio"
                    name="attribution"
                    checked={attribution?.kind === "self"}
                    onChange={() => setAttribution({ kind: "self" })}
                  />
                  It&apos;s me
                </label>

                {suggestion.mode === "candidates" ? (
                  <label className="flex items-center gap-3 rounded-[14px] border border-border-default p-3 text-sm text-ink focus-within:ring-2 focus-within:ring-ink/40">
                    <input
                      type="radio"
                      name="attribution"
                      checked={attribution?.kind === "new_crew"}
                      onChange={() => setAttribution({ kind: "new_crew", fullName: suggestion.spokenName })}
                    />
                    Add &quot;{suggestion.spokenName}&quot; as a new crew member
                  </label>
                ) : null}
              </fieldset>

              {suggestion.mode === "new_person" ? (
                <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
                  <p className="text-sm text-text-secondary">Or choose an existing person:</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={expandQuery}
                      onChange={(event) => setExpandQuery(event.target.value)}
                      placeholder="Search by name"
                      className="min-w-0 flex-1 rounded-[10px] border border-border-default px-3 py-2 text-sm text-ink placeholder:text-text-placeholder focus:outline-none focus:ring-2 focus:ring-ink/40"
                    />
                    <button
                      type="button"
                      onClick={expandCandidates}
                      disabled={!expandQuery.trim() || expanding}
                      className="flex h-[38px] items-center gap-[10px] rounded-[80px] border border-border-default bg-paper px-4 text-sm text-text-secondary shadow-[0_0_4px_rgba(0,0,0,0.05)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
                    >
                      {expanding ? "Searching…" : "Search"}
                    </button>
                  </div>
                  {expandedCandidates ? (
                    expandedCandidates.length === 0 ? (
                      <p className="text-sm text-text-secondary">No matches found.</p>
                    ) : (
                      <fieldset className="flex flex-col gap-2">
                        <legend className="sr-only">Matching people</legend>
                        {expandedCandidates.map((candidate) => (
                          <label
                            key={`${candidate.kind}-${candidate.id}`}
                            className="flex items-center gap-3 rounded-[14px] border border-border-default p-3 text-sm text-ink focus-within:ring-2 focus-within:ring-ink/40"
                          >
                            <input
                              type="radio"
                              name="attribution"
                              checked={attribution?.kind === candidate.kind && attribution.id === candidate.id}
                              onChange={() => setAttribution({ kind: candidate.kind, id: candidate.id })}
                            />
                            {candidate.isSelf ? "It's me" : candidate.fullName}
                            <span className="text-text-faint">
                              {candidate.kind === "profile" ? "worker" : "crew member"}
                            </span>
                          </label>
                        ))}
                      </fieldset>
                    )
                  ) : null}
                </div>
              ) : null}

              {identifyError ? (
                <p role="alert" className="flex items-center gap-2 text-sm text-red-600">
                  <CircleAlert className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  {identifyError}
                </p>
              ) : null}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={confirmIdentify}
                  disabled={!attribution}
                  className="flex h-[42px] items-center gap-[10px] rounded-[80px] bg-ink px-6 text-sm text-paper shadow-[0_0_4px_rgba(0,0,0,0.05)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper"
                >
                  Confirm &amp; Save
                </button>
                <button
                  type="button"
                  onClick={() => setPhase("review")}
                  className="flex h-[42px] items-center gap-[10px] rounded-[80px] border border-border-default bg-paper px-6 text-sm text-text-secondary shadow-[0_0_4px_rgba(0,0,0,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
                >
                  Edit transcript
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {phase === "saving" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-ink" strokeWidth={1.5} />
          <p className="text-base text-ink">
            {saveStatus === "uploading" ? "Uploading recording…" : "Saving your log…"}
          </p>
          {suggestion?.mode === "self" ? (
            <p className="text-sm text-text-secondary">Identified as you ({suggestion.selfName})</p>
          ) : null}
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
