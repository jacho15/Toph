import type { VoiceLogExtractionUsage } from "./extract-core";

type Rates = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

// USD per million tokens.
const PRICING: Record<string, Rates> = {
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
};

// An unpriced/unknown model is charged at the most expensive known rate, so
// a pricing gap fails toward under-counting budget headroom rather than
// letting spend through uncapped.
const UNKNOWN_MODEL_RATES: Rates = { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 };

function ratesFor(model: string): Rates {
  return PRICING[model] ?? UNKNOWN_MODEL_RATES;
}

/** Computes the USD cost of a usage record, rounded up to 6 decimal places. */
export function costUsd(usage: VoiceLogExtractionUsage): number {
  const rates = ratesFor(usage.model);
  const cost =
    (usage.input_tokens / 1_000_000) * rates.input +
    (usage.output_tokens / 1_000_000) * rates.output +
    ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * rates.cacheRead +
    ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * rates.cacheWrite;
  return Math.ceil(cost * 1_000_000) / 1_000_000;
}
