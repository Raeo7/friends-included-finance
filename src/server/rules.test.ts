import { beforeEach, describe, expect, it } from "vitest";
import type { RawExpense, RawSale } from "@/domain/validation";
import { handleTelegramUpdate } from "@/server/bot";
import {
  ServiceError,
  allocateExpense,
  approveSale,
  linkTelegram,
  loadState,
  retryNotification,
  retrySync,
  submitExpense,
  submitSale,
  unlinkTelegram,
  updateSettings,
} from "@/server/service";
import { createTestDeps } from "@/server/testDoubles";

type TestDeps = ReturnType<typeof createTestDeps>;

const SALE: RawSale = {
  ref: "S01",
  customer: "Olivia Rose",
  project: "A",
  description: "One proud uncle",
  amount: "1000",
  split: { richard: "50", anastasia: "30", "jean-claude": "20" },
};

const EXPENSE: RawExpense = {
  ref: "E01",
  description: "Rented suit",
  category: "Materials",
  amount: "120",
  allocation: "A",
};

async function rejection(promise: Promise<unknown>): Promise<ServiceError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ServiceError) return error;
    throw error;
  }
  throw new Error("expected the action to be refused");
}

async function totals(deps: TestDeps) {
  const state = await loadState(deps, "svetlana");
  return {
    results: state.manager?.results,
    sales: state.sales.length,
    expenses: state.expenses.length,
  };
}

describe("rule enforcement at the processing layer", () => {
  let deps: TestDeps;

  beforeEach(async () => {
    deps = createTestDeps();
    await submitSale(deps, "richard", SALE);
    await submitExpense(deps, "kevin", EXPENSE);
  });

  it("refuses a split that does not total 100%", async () => {
    const before = await totals(deps);
    const error = await rejection(
      submitSale(deps, "richard", {
        ...SALE,
        ref: "S99",
        split: { richard: "60", anastasia: "30", "jean-claude": "20" },
      }),
    );
    expect(error.status).toBe(400);
    expect(error.details.join(" ")).toContain("total 110%");
    expect(await totals(deps)).toEqual(before);
  });

  it("denies approval to a salesperson", async () => {
    const error = await rejection(approveSale(deps, "richard", "S01", null));
    expect(error.status).toBe(403);
    expect((await deps.store.getSale("S01"))?.status).toBe("pending");
  });

  it("denies expense allocation and setup actions to non-managers", async () => {
    expect((await rejection(allocateExpense(deps, "kevin", "E01", "A"))).status).toBe(403);
    expect((await rejection(linkTelegram(deps, "kevin", "123", "svetlana"))).status).toBe(403);
    expect((await rejection(unlinkTelegram(deps, "anastasia", "123"))).status).toBe(403);
    expect((await rejection(retrySync(deps, "richard", "sale", "S01"))).status).toBe(403);
    expect(
      (
        await rejection(
          updateSettings(deps, "kevin", {
            simulate_sheets_failure: true,
            simulate_telegram_failure: false,
          }),
        )
      ).status,
    ).toBe(403);
  });

  it("denies a sale submitted by Kevin or the manager, and an expense by a salesperson", async () => {
    expect((await rejection(submitSale(deps, "kevin", { ...SALE, ref: "S98" }))).status).toBe(403);
    expect((await rejection(submitSale(deps, "svetlana", { ...SALE, ref: "S98" }))).status).toBe(
      403,
    );
    expect(
      (await rejection(submitExpense(deps, "anastasia", { ...EXPENSE, ref: "E98" }))).status,
    ).toBe(403);
    expect(await deps.store.refExists("S98")).toBe(false);
    expect(await deps.store.refExists("E98")).toBe(false);
  });

  it.each(["", "0", "0.00", "-5", "abc"])("refuses an expense amount of %j", async (amount) => {
    const error = await rejection(submitExpense(deps, "kevin", { ...EXPENSE, ref: "E50", amount }));
    expect(error.status).toBe(400);
    expect(await deps.store.refExists("E50")).toBe(false);
  });

  it("refuses missing required fields with a message per field", async () => {
    const error = await rejection(
      submitSale(deps, "anastasia", {
        ...SALE,
        ref: "S60",
        customer: " ",
        description: "",
        project: "C",
      }),
    );
    expect(error.details).toEqual([
      "Customer is required.",
      "Project must be A (Respectable Relatives) or B (Drunk University Friends).",
      "Description is required.",
    ]);
  });

  it("refuses duplicate references, including across sales and expenses and letter case", async () => {
    expect((await rejection(submitSale(deps, "anastasia", { ...SALE, ref: "s01" }))).status).toBe(
      409,
    );
    expect((await rejection(submitExpense(deps, "kevin", { ...EXPENSE, ref: "S01" }))).status).toBe(
      409,
    );
    expect((await deps.store.getSale("S01"))?.salesperson).toBe("richard");
  });

  it("approving twice changes nothing and sends no second notification", async () => {
    await approveSale(deps, "svetlana", "S01", null);
    await allocateExpense(deps, "svetlana", "E01", "B");
    const before = await totals(deps);
    const sentBefore = deps.telegram.sent.length;
    const writesBefore = deps.sheets.writes;

    expect(
      (
        await rejection(
          approveSale(deps, "svetlana", "S01", {
            richard: "100",
            anastasia: "0",
            "jean-claude": "0",
          }),
        )
      ).status,
    ).toBe(409);
    expect((await rejection(allocateExpense(deps, "svetlana", "E01", "A"))).status).toBe(409);

    expect(await totals(deps)).toEqual(before);
    expect(deps.telegram.sent.length).toBe(sentBefore);
    expect(deps.sheets.writes).toBe(writesBefore);
  });

  it("allocation decision does not deduct the expense from company result twice", async () => {
    const before = (await totals(deps)).results?.company.result;
    await allocateExpense(deps, "svetlana", "E01", "B");
    const after = await totals(deps);
    expect(after.results?.company.result).toBe(before);
    expect(after.results?.projects.B.allocatedExpenses).toBe(12000);
  });

  it("employees see only their own submissions", async () => {
    await submitSale(deps, "anastasia", { ...SALE, ref: "S02" });
    const richard = await loadState(deps, "richard");
    expect(richard.sales.map((s) => s.ref)).toEqual(["S01"]);
    expect(richard.expenses).toEqual([]);
    expect(richard.manager).toBeNull();
    expect((await loadState(deps, "kevin")).expenses.map((e) => e.ref)).toEqual(["E01"]);
  });
});

describe("integration failures", () => {
  let deps: TestDeps;

  beforeEach(() => {
    deps = createTestDeps();
  });

  it("keeps the transaction when Sheets fails, and retry restores the same row", async () => {
    deps.sheets.failing = true;
    const sale = await submitSale(deps, "richard", SALE);
    expect(sale.sync_status).toBe("failed");
    expect(sale.sync_error).toContain("Sheets API unavailable");

    const approved = await approveSale(deps, "svetlana", "S01", null);
    expect(approved.status).toBe("approved");
    expect(approved.sync_status).toBe("failed");
    const resultBefore = (await totals(deps)).results;

    deps.sheets.failing = false;
    const retried = await retrySync(deps, "svetlana", "sale", "S01");
    expect(retried.sync_status).toBe("synced");
    expect([...deps.sheets.sales.keys()]).toEqual(["S01"]);
    expect(deps.sheets.sales.get("S01")?.status).toBe("approved");
    expect((await totals(deps)).results).toEqual(resultBefore);
    expect((await loadState(deps, "svetlana")).sales).toHaveLength(1);
  });

  it("the manager toggle simulates a Sheets outage without touching totals", async () => {
    await updateSettings(deps, "svetlana", {
      simulate_sheets_failure: true,
      simulate_telegram_failure: false,
    });
    const expense = await submitExpense(deps, "kevin", EXPENSE);
    expect(expense.sync_status).toBe("failed");
    await updateSettings(deps, "svetlana", {
      simulate_sheets_failure: false,
      simulate_telegram_failure: false,
    });
    expect((await retrySync(deps, "svetlana", "expense", "E01")).sync_status).toBe("synced");
  });

  it("a failed Telegram notification keeps the approval and is not reported as sent", async () => {
    await linkTelegram(deps, "svetlana", "555", "richard");
    await submitSale(deps, "richard", SALE);
    deps.telegram.failingChats.add("555");

    const approved = await approveSale(deps, "svetlana", "S01", null);
    expect(approved.status).toBe("approved");
    expect(approved.notify_status).toBe("failed");
    expect(approved.notify_error).toContain("blocked");
    expect(deps.telegram.sent).toEqual([]);

    deps.telegram.failingChats.clear();
    const retried = await retryNotification(deps, "svetlana", "sale", "S01");
    expect(retried.notify_status).toBe("sent");
    expect(deps.telegram.sent).toHaveLength(1);
    await expect(retryNotification(deps, "svetlana", "sale", "S01")).rejects.toThrow(
      /No failed notification/,
    );
  });

  it("website entry with no linked employee shows no recipient, and retry works once linked", async () => {
    await submitExpense(deps, "kevin", EXPENSE);
    const allocated = await allocateExpense(deps, "svetlana", "E01", "A");
    expect(allocated.notify_status).toBe("no_recipient");
    expect(allocated.notify_error).toBe("No Telegram recipient linked");

    await linkTelegram(deps, "svetlana", "888", "kevin");
    expect((await retryNotification(deps, "svetlana", "expense", "E01")).notify_status).toBe(
      "sent",
    );
  });

  it("overhead expenses are allocated automatically and need no decision notification", async () => {
    const expense = await submitExpense(deps, "kevin", { ...EXPENSE, allocation: "overhead" });
    expect(expense.status).toBe("allocated");
    expect(expense.final_allocation).toBe("overhead");
    expect(expense.notify_status).toBe("not_required");
    expect((await rejection(allocateExpense(deps, "svetlana", "E01", "A"))).status).toBe(409);
  });
});

describe("Telegram bot access", () => {
  it("an unlinked user cannot submit and cannot assign a role", async () => {
    const deps = createTestDeps();
    const send = (text: string) =>
      handleTelegramUpdate(deps, {
        update_id: 1,
        message: { chat: { id: 42 }, from: { id: 42 }, text },
      });

    await send("/sale S01 | Olivia | A | Uncle | 1000 | 50/30/20");
    expect(deps.telegram.lastTo("42")).toContain("not linked");
    expect(await deps.store.refExists("S01")).toBe(false);

    await send("/link svetlana");
    expect(await deps.store.getLinkByTelegramUser("42")).toBeNull();
    expect((await deps.store.listContacts()).map((c) => c.telegram_user_id)).toEqual(["42"]);
  });

  it("explains what to correct when a bot submission fails", async () => {
    const deps = createTestDeps();
    await linkTelegram(deps, "svetlana", "42", "kevin");
    await handleTelegramUpdate(deps, {
      update_id: 2,
      message: { chat: { id: 42 }, from: { id: 42 }, text: "/expense E09 | Taxi | Travel | 0 | A" },
    });
    const reply = deps.telegram.lastTo("42") ?? "";
    expect(reply).toContain("Not recorded");
    expect(reply).toContain("Amount must be greater than zero.");
    expect(await deps.store.refExists("E09")).toBe(false);
  });

  it("a salesperson linked in Telegram cannot submit expenses through the bot", async () => {
    const deps = createTestDeps();
    await linkTelegram(deps, "svetlana", "42", "richard");
    await handleTelegramUpdate(deps, {
      update_id: 3,
      message: {
        chat: { id: 42 },
        from: { id: 42 },
        text: "/expense E09 | Taxi | Travel | 10 | A",
      },
    });
    expect(deps.telegram.lastTo("42")).toContain("not allowed to submit expenses");
  });
});
