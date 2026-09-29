import type { CommissionCents, Salesperson, Split } from "@/domain/types";
import { SALESPEOPLE } from "@/domain/types";

export const FULL_SPLIT_BP = 100_00;
const COMMISSION_RATE_BP = 10_00;

export function commissionPoolCents(amountCents: number): number {
  return Math.round((amountCents * COMMISSION_RATE_BP) / FULL_SPLIT_BP);
}

export function splitTotalBp(split: Split): number {
  return split.richard + split.anastasia + split["jean-claude"];
}

/** Largest share wins; ties go to Richard, then Anastasia, then Jean-Claude (SALESPEOPLE order). */
function largestShareHolder(split: Split): Salesperson {
  let best: Salesperson = SALESPEOPLE[0];
  for (const person of SALESPEOPLE) {
    if (split[person] > split[best]) {
      best = person;
    }
  }
  return best;
}

/**
 * Divides the 10% commission pool of a sale by the given split.
 *
 * Each share is rounded to cents; any rounding difference goes to the largest share holder so the
 * shares always add up to the pool exactly.
 */
export function calculateCommission(amountCents: number, split: Split): CommissionCents {
  if (splitTotalBp(split) !== FULL_SPLIT_BP) {
    throw new Error(`Commission split must total 100%, got ${splitTotalBp(split) / 100}%`);
  }
  const pool = commissionPoolCents(amountCents);
  const shares: CommissionCents = {
    richard: Math.round((pool * split.richard) / FULL_SPLIT_BP),
    anastasia: Math.round((pool * split.anastasia) / FULL_SPLIT_BP),
    "jean-claude": Math.round((pool * split["jean-claude"]) / FULL_SPLIT_BP),
  };
  const difference = pool - splitTotalBp(shares);
  shares[largestShareHolder(split)] += difference;
  return shares;
}

export function totalCommission(commission: CommissionCents): number {
  return splitTotalBp(commission);
}

export function splitsEqual(a: Split, b: Split): boolean {
  return SALESPEOPLE.every((person) => a[person] === b[person]);
}
