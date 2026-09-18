"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateLog } from "@/app/actions/logs";
import { formatActivityLabel } from "@/lib/format";
import { isoToLocalInput, localInputToIso } from "@/lib/tz";
import type { ActivityType, Field, LogFeedRow } from "@/lib/types";

const FARM_TIME_ZONE = "America/Chicago";

// Kept as a plain local list (rather than importing from lib/ai/extract-voice-log, which is
// `server-only` and cannot be pulled into a client bundle) — same 9 values as the activity_type
// enum, already duplicated the same way in app/(app)/activity-logs/page.tsx.
const ACTIVITY_OPTIONS: ActivityType[] = [
  "spraying",
  "fertilizing",
  "planting",
  "irrigating",
  "harvesting",
  "scouting",
  "pruning",
  "soil_work",
  "equipment_maintenance",
];

function detailString(details: Record<string, unknown>, key: string): string {
  const value = details[key];
  return typeof value === "string" ? value : "";
}

export default function EditLogForm({
  log,
  fields,
  onCancel,
  onSaved,
}: {
  log: LogFeedRow;
  fields: Field[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();

  const [activity, setActivity] = useState<ActivityType>(log.activity);
  const [fieldId, setFieldId] = useState(log.field_id ?? "");
  const [startedAt, setStartedAt] = useState(() => isoToLocalInput(log.started_at, FARM_TIME_ZONE));
  const [endedAt, setEndedAt] = useState(() =>
    log.ended_at ? isoToLocalInput(log.ended_at, FARM_TIME_ZONE) : ""
  );
  const [product, setProduct] = useState(() => detailString(log.details, "product"));
  const [rate, setRate] = useState(() => detailString(log.details, "rate"));
  const [notes, setNotes] = useState(() => detailString(log.details, "notes"));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `datetime-local` only holds minutes, so a log stored with seconds (anything created by the
  // voice pipeline) round-trips to a different instant even when the field is never touched —
  // which would otherwise land in the audit trail as a time correction nobody made. Send the
  // timestamps only when the input actually differs from what it was populated with.
  const initialStartedAt = isoToLocalInput(log.started_at, FARM_TIME_ZONE);
  const initialEndedAt = log.ended_at ? isoToLocalInput(log.ended_at, FARM_TIME_ZONE) : "";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const result = await updateLog({
      logId: log.id,
      activity,
      fieldId: fieldId === "" ? null : fieldId,
      ...(startedAt !== initialStartedAt
        ? { startedAt: localInputToIso(startedAt, FARM_TIME_ZONE) }
        : {}),
      ...(endedAt !== initialEndedAt
        ? { endedAt: endedAt === "" ? null : localInputToIso(endedAt, FARM_TIME_ZONE) }
        : {}),
      product,
      rate,
      notes,
    });

    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
    onSaved();
  }

  const inputClass =
    "h-[42px] w-full rounded-[7.04px] border border-ink/10 bg-paper px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/40";
  const labelClass = "mb-1 block text-2xs font-medium text-text-secondary";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-10">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <div>
          <label className={labelClass} htmlFor="edit-log-activity">
            Activity
          </label>
          <select
            id="edit-log-activity"
            value={activity}
            onChange={(event) => setActivity(event.target.value as ActivityType)}
            className={inputClass}
          >
            {ACTIVITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {formatActivityLabel(option)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="edit-log-field">
            Field
          </label>
          <select
            id="edit-log-field"
            value={fieldId}
            onChange={(event) => setFieldId(event.target.value)}
            className={inputClass}
          >
            <option value="">No field</option>
            {fields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="edit-log-started">
            Start time
          </label>
          <input
            id="edit-log-started"
            type="datetime-local"
            value={startedAt}
            onChange={(event) => setStartedAt(event.target.value)}
            required
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="edit-log-ended">
            End time
          </label>
          <input
            id="edit-log-ended"
            type="datetime-local"
            value={endedAt}
            onChange={(event) => setEndedAt(event.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="edit-log-product">
            Product
          </label>
          <input
            id="edit-log-product"
            type="text"
            value={product}
            onChange={(event) => setProduct(event.target.value)}
            maxLength={120}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="edit-log-rate">
            Rate
          </label>
          <input
            id="edit-log-rate"
            type="text"
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            maxLength={120}
            className={inputClass}
          />
        </div>

        <div className="col-span-2 md:col-span-3">
          <label className={labelClass} htmlFor="edit-log-notes">
            Notes
          </label>
          <input
            id="edit-log-notes"
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={1000}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex h-[34px] items-center justify-center rounded-[80px] bg-ink px-4 text-sm text-paper disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="flex h-[34px] items-center justify-center rounded-[80px] border border-border-default bg-paper px-4 text-sm text-text-secondary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
