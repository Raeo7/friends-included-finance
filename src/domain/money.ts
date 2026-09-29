const AMOUNT_PATTERN = /^(\d{1,9})(?:[.,](\d{1,2}))?$/;
const PERCENT_PATTERN = /^(\d{1,3})(?:[.,](\d{1,2}))?$/;

export const MAX_AMOUNT_CENTS = 100_000_000_00;

/**
 * Parses a euro amount such as "1000", "1000.5" or "€ 1000,50" into cents.
 *
 * Returns null when the text is not a plain non-negative number with at most two decimals.
 */
export function parseEuroToCents(raw: string): number | null {
  const cleaned = raw.replace(/[€\s]/g, "").replace(/^EUR/i, "");
  const match = AMOUNT_PATTERN.exec(cleaned);
  if (!match) {
    return null;
  }
  const euros = Number(match[1]);
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return euros * 100 + Number(fraction);
}

/** Parses "50", "33.33" or "33,33" into basis points of a percent (5000 = 50%). */
export function parsePercentToBp(raw: string): number | null {
  const cleaned = raw.replace(/[%\s]/g, "");
  const match = PERCENT_PATTERN.exec(cleaned);
  if (!match) {
    return null;
  }
  const whole = Number(match[1]);
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return whole * 100 + Number(fraction);
}

export function formatEuro(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100).toLocaleString("en-US");
  const rest = String(abs % 100).padStart(2, "0");
  return `${sign}€${euros}.${rest}`;
}

/** Plain two-decimal number for spreadsheets, e.g. 1000.00. */
export function formatDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function formatPercent(bp: number): string {
  const whole = Math.floor(bp / 100);
  const rest = bp % 100;
  return rest === 0 ? `${whole}%` : `${whole}.${String(rest).padStart(2, "0").replace(/0$/, "")}%`;
}
