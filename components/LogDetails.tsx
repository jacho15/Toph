import { Check, CircleAlert } from "lucide-react";
import type { LogAnswer } from "@/lib/types";

const DETAIL_LABELS: Record<string, string> = {
  product: "Product",
  rate: "Rate",
  carrier: "Carrier",
  moisture: "Moisture",
  yield: "Yield",
  depth: "Depth",
  seed_rate: "Seed rate",
  application: "Application",
};

const QUESTION_LABELS: Record<string, string> = {
  activity_type: "Activity",
  field_block: "Field or block",
  product_rate: "Product and rate",
};

function humanizeKey(key: string): string {
  const spaced = key.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatDetailValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const json = JSON.stringify(value);
    return json === "{}" || json === "[]" ? null : json;
  } catch {
    return null;
  }
}

export function RecordedDetails({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details)
    .filter(([key]) => key !== "confidence")
    .map(([key, value]) => [key, formatDetailValue(value)] as const)
    .filter((entry): entry is [string, string] => entry[1] !== null);

  if (entries.length === 0) return null;

  const confidence = typeof details.confidence === "number" ? details.confidence : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-base leading-[20.8px] text-ink">Recorded Details</h3>
        {confidence !== null ? (
          <span className="text-sm text-text-secondary">AI confidence {Math.round(confidence * 100)}%</span>
        ) : null}
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-[7.04px] border border-border-subtle p-3 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="flex flex-col gap-0.5">
            <dt className="text-sm text-text-secondary">{DETAIL_LABELS[key] ?? humanizeKey(key)}</dt>
            <dd className="text-base leading-[20.8px] text-ink/30">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function GuidedAnswers({ answers }: { answers: LogAnswer[] }) {
  if (answers.length === 0) return null;
  const sorted = [...answers].sort((a, b) => a.position - b.position);

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-base leading-[20.8px] text-ink">Guided Answers</h3>
      <ul className="flex flex-col gap-3 rounded-[7.04px] border border-border-subtle p-3">
        {sorted.map((answer) => (
          <li key={answer.question_key} className="flex items-start gap-2">
            {answer.is_valid ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-tag-green" strokeWidth={1.5} aria-label="Valid answer" />
            ) : (
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.5} aria-label="Unclear answer" />
            )}
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-secondary">
                  {QUESTION_LABELS[answer.question_key] ?? humanizeKey(answer.question_key)}
                </span>
                {!answer.is_valid ? <span className="text-2xs text-text-muted">Unclear</span> : null}
              </div>
              <p className="text-base leading-[20.8px] text-ink/30">{answer.answer}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-text-faint">Unclear answers lower this farm&apos;s Response Accuracy.</p>
    </div>
  );
}

export function TranscriptDisclosure({
  transcript,
  summary,
}: {
  transcript: string | null;
  summary: string | null;
}) {
  if (!transcript || transcript === summary) return null;

  return (
    <details className="text-sm text-text-faint">
      <summary className="cursor-pointer select-none text-text-secondary">Show raw transcript</summary>
      <p className="mt-1 text-base leading-[20.8px] text-ink/30">{transcript}</p>
    </details>
  );
}
