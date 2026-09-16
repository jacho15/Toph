/// <reference lib="webworker" />

// Runs Whisper speech-to-text off the main thread so the UI stays responsive while the
// model downloads and while transcription runs. Communicates with the main thread via
// postMessage — see `WorkerToMainMessage` / `MainToWorkerMessage` below.

import {
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
  type ProgressInfo,
} from "@huggingface/transformers";

const PRIMARY_MODEL = "onnx-community/whisper-base.en";
const FALLBACK_MODEL = "Xenova/whisper-tiny.en";

export type MainToWorkerMessage = {
  type: "transcribe";
  audio: Float32Array;
};

export type WorkerToMainMessage =
  | { type: "model-progress"; model: string; progress: ProgressInfo }
  | { type: "status"; status: "loading-model" | "transcribing" }
  | { type: "result"; text: string }
  | { type: "error"; error: string };

function post(message: WorkerToMainMessage) {
  (self as unknown as Worker).postMessage(message);
}

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

async function loadTranscriber(): Promise<AutomaticSpeechRecognitionPipeline> {
  async function load(model: string) {
    return pipeline("automatic-speech-recognition", model, {
      progress_callback: (progress: ProgressInfo) => post({ type: "model-progress", model, progress }),
    });
  }

  try {
    return await load(PRIMARY_MODEL);
  } catch (primaryError) {
    console.error(`Failed to load ${PRIMARY_MODEL}, falling back to ${FALLBACK_MODEL}`, primaryError);
    return await load(FALLBACK_MODEL);
  }
}

function getTranscriber(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!transcriberPromise) transcriberPromise = loadTranscriber();
  return transcriberPromise;
}

self.addEventListener("message", (event: MessageEvent<MainToWorkerMessage>) => {
  const message = event.data;
  if (message.type !== "transcribe") return;

  void (async () => {
    try {
      post({ type: "status", status: "loading-model" });
      const transcriber = await getTranscriber();

      post({ type: "status", status: "transcribing" });
      const output = await transcriber(message.audio, {
        chunk_length_s: 30,
        stride_length_s: 5,
      });

      const text = Array.isArray(output) ? output.map((o) => o.text).join(" ") : output.text;
      post({ type: "result", text: text.trim() });
    } catch (error) {
      post({ type: "error", error: error instanceof Error ? error.message : "Transcription failed." });
    }
  })();
});
