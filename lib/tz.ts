/**
 * Timezone-safe conversion of a local "HH:MM" time (on the same calendar date as
 * `referenceIso`, evaluated in `timeZone`) to a UTC ISO 8601 instant. Uses `Intl` only —
 * no date library.
 */
export function localTimeToIso(hhmm: string, referenceIso: string, timeZone: string): string {
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(referenceIso));

  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);

  const naiveUtcMs = Date.UTC(y, mo - 1, d, h, mi, 0);
  const offsetMs = timeZoneOffsetMs(new Date(naiveUtcMs), timeZone);
  return new Date(naiveUtcMs - offsetMs).toISOString();
}

/** How far "ahead" `timeZone`'s wall clock reads versus true UTC, at `date`, in ms. */
function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  // Some ICU implementations report midnight as hour "24" under hourCycle "h23".
  const hour = map.hour === "24" ? "0" : map.hour;

  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - date.getTime();
}
