import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { calculateCommission, commissionPoolCents, totalCommission } from "@/domain/commission";
import { formatEuro, formatPercent, parseEuroToCents, parsePercentToBp } from "@/domain/money";
import { expenseAllocatedMessage, saleApprovedMessage } from "@/domain/messages";
import { parseBotCommand } from "@/domain/telegramCommands";
import type { ExpenseRecord, SaleRecord, Split } from "@/domain/types";
import { validateSplit } from "@/domain/validation";

const split = (richard: number, anastasia: number, jeanClaude: number): Split => ({
  richard: richard * 100,
  anastasia: anastasia * 100,
  "jean-claude": jeanClaude * 100,
});

describe("commission", () => {
  it("matches the homework example", () => {
    expect(calculateCommission(100_000, split(50, 30, 20))).toEqual({
      richard: 5000,
      anastasia: 3000,
      "jean-claude": 2000,
    });
  });

  it("gives the rounding difference to the largest share", () => {
    // €1.00 sale -> 10 cent pool; 1/3 each rounds to 3+3+3, Richard gets the extra cent.
    expect(
      calculateCommission(100, { richard: 3334, anastasia: 3333, "jean-claude": 3333 }),
    ).toEqual({
      richard: 4,
      anastasia: 3,
      "jean-claude": 3,
    });
  });

  it("breaks ties for the largest share by Richard, Anastasia, Jean-Claude", () => {
    // €0.10 sale -> 1 cent pool.
    expect(calculateCommission(10, split(0, 50, 50))).toEqual({
      richard: 0,
      anastasia: 0,
      "jean-claude": 1,
    });
    expect(calculateCommission(10, split(50, 50, 0))).toEqual({
      richard: 0,
      anastasia: 1,
      "jean-claude": 0,
    });
  });

  it("rounds the pool to cents", () => {
    expect(commissionPoolCents(12_345)).toBe(1235);
    expect(commissionPoolCents(12_344)).toBe(1234);
  });

  it("rejects a split that does not total 100%", () => {
    expect(() => calculateCommission(1000, split(60, 30, 20))).toThrow(/total 100%/);
  });

  it("always distributes exactly the pool, with no negative shares", () => {
    const splitArb = fc
      .tuple(fc.integer({ min: 0, max: 10_000 }), fc.integer({ min: 0, max: 10_000 }))
      .map(([a, b]) => {
        const [low, high] = a <= b ? [a, b] : [b, a];
        return { richard: low, anastasia: high - low, "jean-claude": 10_000 - high };
      });
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000_000 }), splitArb, (amount, s) => {
        const shares = calculateCommission(amount, s);
        expect(totalCommission(shares)).toBe(commissionPoolCents(amount));
        expect(
          Math.min(shares.richard, shares.anastasia, shares["jean-claude"]),
        ).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});

describe("money parsing and formatting", () => {
  it.each([
    ["1000", 100_000],
    ["1000.5", 100_050],
    ["1000,50", 100_050],
    ["€ 80", 8000],
    ["0", 0],
  ])("parses %j", (raw, cents) => {
    expect(parseEuroToCents(raw)).toBe(cents);
  });

  it.each(["", "-5", "1.234", "1,000.00", "ten", "1e3"])("rejects %j", (raw) => {
    expect(parseEuroToCents(raw)).toBeNull();
  });

  it("round-trips any cent amount through formatting", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000_000 }), (cents) => {
        const text = formatEuro(cents).replace(/,/g, "");
        expect(parseEuroToCents(text)).toBe(cents);
      }),
    );
  });

  it("formats euros and percentages", () => {
    expect(formatEuro(-30_000)).toBe("-€300.00");
    expect(formatEuro(393_000)).toBe("€3,930.00");
    expect(formatPercent(5000)).toBe("50%");
    expect(formatPercent(3333)).toBe("33.33%");
    expect(formatPercent(3350)).toBe("33.5%");
    expect(parsePercentToBp("33,5%")).toBe(3350);
  });

  it("validates split bounds", () => {
    expect(validateSplit({ richard: "101", anastasia: "0", "jean-claude": "-1" }).ok).toBe(false);
    expect(validateSplit({ richard: "", anastasia: "50", "jean-claude": "50" }).ok).toBe(false);
    expect(validateSplit({ richard: "33.34", anastasia: "33.33", "jean-claude": "33.33" }).ok).toBe(
      true,
    );
  });
});

describe("bot command parsing", () => {
  it("parses a sale with the split in Richard/Anastasia/Jean-Claude order", () => {
    expect(
      parseBotCommand("/sale@FriendsBot S01 | Olivia Rose | a | Uncle | 1000 | 50 / 30 / 20"),
    ).toEqual({
      kind: "sale",
      raw: {
        ref: "S01",
        customer: "Olivia Rose",
        project: "a",
        description: "Uncle",
        amount: "1000",
        split: { richard: "50", anastasia: "30", "jean-claude": "20" },
      },
    });
  });

  it("reports the wrong number of fields", () => {
    const result = parseBotCommand("/expense E01 | Suit | Materials | 120");
    expect(result.kind).toBe("invalid");
  });

  it("ignores ordinary text", () => {
    expect(parseBotCommand("hello")).toEqual({ kind: "unknown" });
  });
});

describe("decision notifications", () => {
  const baseSale: SaleRecord = {
    ref: "S02",
    submitted_at: "",
    salesperson: "anastasia",
    customer: "Daniel King",
    project: "B",
    description: "",
    amount_cents: 200_000,
    proposed_split: split(0, 50, 50),
    approved_split: split(20, 40, 40),
    commission_cents: { richard: 4000, anastasia: 8000, "jean-claude": 8000 },
    status: "approved",
    decided_at: null,
    source: "web",
    origin_chat_id: null,
    notify_status: "not_required",
    notify_chat_id: null,
    notify_error: null,
    sync_status: "synced",
    sync_error: null,
  };

  it("matches the homework sale example", () => {
    expect(saleApprovedMessage(baseSale)).toBe(
      [
        "Sale S02 approved — commission split changed.",
        "Sale €2,000.00; total commission €200.00.",
        "Richard: 0% → 20% (€40.00)",
        "Anastasia: 50% → 40% (€80.00)",
        "Jean-Claude: 50% → 40% (€80.00)",
      ].join("\n"),
    );
  });

  it("says when the split is unchanged", () => {
    const text = saleApprovedMessage({ ...baseSale, proposed_split: split(20, 40, 40) });
    expect(text).toContain("unchanged");
    expect(text).not.toContain("→");
  });

  it("matches the homework expense example", () => {
    const expense: ExpenseRecord = {
      ref: "E02",
      submitted_at: "",
      reporter: "kevin",
      description: "Taxi for the grandmother",
      category: "Travel",
      amount_cents: 8000,
      proposed_allocation: "B",
      final_allocation: "A",
      status: "allocated",
      decided_at: null,
      source: "web",
      origin_chat_id: null,
      notify_status: "not_required",
      notify_chat_id: null,
      notify_error: null,
      sync_status: "synced",
      sync_error: null,
    };
    expect(expenseAllocatedMessage(expense)).toBe(
      [
        "Expense E02 — allocation CHANGED.",
        "€80.00: Taxi for the grandmother",
        "Proposed: Drunk University Friends.",
        "Approved: Respectable Relatives.",
      ].join("\n"),
    );
  });
});
