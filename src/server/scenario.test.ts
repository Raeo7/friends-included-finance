import { beforeAll, describe, expect, it } from "vitest";
import type { FinancialResults } from "@/domain/results";
import type { EmployeeId } from "@/domain/types";
import type { RawSplit } from "@/domain/validation";
import { handleTelegramUpdate } from "@/server/bot";
import {
  allocateExpense,
  approveSale,
  linkTelegram,
  loadState,
  submitExpense,
  submitSale,
} from "@/server/service";
import { createTestDeps } from "@/server/testDoubles";

const MY_TELEGRAM = "777000111";

function split(r: string, a: string, j: string): RawSplit {
  return { richard: r, anastasia: a, "jean-claude": j };
}

function euros(results: FinancialResults) {
  const e = (c: number) => c / 100;
  return {
    A: {
      income: e(results.projects.A.income),
      commission: e(results.projects.A.commission),
      allocated: e(results.projects.A.allocatedExpenses),
      result: e(results.projects.A.result),
    },
    B: {
      income: e(results.projects.B.income),
      commission: e(results.projects.B.commission),
      allocated: e(results.projects.B.allocatedExpenses),
      result: e(results.projects.B.result),
    },
    company: {
      income: e(results.company.income),
      commission: e(results.company.commission),
      allocated: e(results.company.allocatedExpenses),
      overhead: e(results.company.overhead),
      awaiting: e(results.company.awaitingAllocation),
      result: e(results.company.result),
    },
    commission: {
      richard: e(results.commissionBySalesperson.richard),
      anastasia: e(results.commissionBySalesperson.anastasia),
      jeanClaude: e(results.commissionBySalesperson["jean-claude"]),
    },
  };
}

function botMessage(text: string, updateId: number) {
  return {
    update_id: updateId,
    message: {
      chat: { id: Number(MY_TELEGRAM) },
      from: { id: Number(MY_TELEGRAM), first_name: "Tester" },
      text,
    },
  };
}

describe("homework Test 1 and Test 2", () => {
  const deps = createTestDeps();

  async function results(): Promise<FinancialResults> {
    const state = await loadState(deps, "svetlana");
    if (!state.manager) throw new Error("manager view missing");
    return state.manager.results;
  }

  async function link(employee: EmployeeId) {
    await linkTelegram(deps, "svetlana", MY_TELEGRAM, employee);
  }

  beforeAll(async () => {
    await handleTelegramUpdate(deps, botMessage("/start", 1));
  });

  it("Test 1: S01 and E01 through the bot keep their original chat after re-linking", async () => {
    await link("richard");
    await handleTelegramUpdate(
      deps,
      botMessage(
        "/sale S01 | Olivia Rose | A | One proud uncle and an emotional grandmother | 1000 | 50/30/20",
        2,
      ),
    );
    expect(deps.telegram.lastTo(MY_TELEGRAM)).toContain("Sale S01 recorded.");
    expect(deps.telegram.lastTo(MY_TELEGRAM)).toContain("Status: Pending approval");

    await link("kevin");
    await handleTelegramUpdate(
      deps,
      botMessage(
        "/expense E01 | Rented suit and fake pearl necklace for the relatives | Materials | 120 | A",
        3,
      ),
    );
    expect(deps.telegram.lastTo(MY_TELEGRAM)).toContain("Expense E01 recorded.");

    const s01 = await deps.store.getSale("S01");
    expect(s01?.salesperson).toBe("richard");
    expect(s01?.origin_chat_id).toBe(MY_TELEGRAM);
  });

  it("Test 1: website entries and pre-decision results", async () => {
    await submitSale(deps, "anastasia", {
      ref: "S02",
      customer: "Daniel King",
      project: "B",
      description: "University friends, dancing, and the stripping performance",
      amount: "2000",
      split: split("0", "50", "50"),
    });
    await submitExpense(deps, "kevin", {
      ref: "E02",
      description: "Taxi for the grandmother; Kevin selected the wrong project",
      category: "Travel",
      amount: "80",
      allocation: "B",
    });
    await submitExpense(deps, "kevin", {
      ref: "E03",
      description: "Monthly company website subscription",
      category: "Other",
      amount: "100",
      allocation: "overhead",
    });

    const r = euros(await results());
    expect(r.company.income).toBe(0);
    expect(r.company.commission).toBe(0);
    expect(r.A.result).toBe(0);
    expect(r.B.result).toBe(0);
    expect(r.company.result).toBe(-300);
  });

  it("Test 1: manager decisions produce the published results", async () => {
    await approveSale(deps, "svetlana", "S01", null);
    await approveSale(deps, "svetlana", "S02", split("20", "40", "40"));
    await allocateExpense(deps, "svetlana", "E01", "A");
    const e02 = await allocateExpense(deps, "svetlana", "E02", "A");

    expect(euros(await results())).toEqual({
      A: { income: 1000, commission: 100, allocated: 200, result: 700 },
      B: { income: 2000, commission: 200, allocated: 0, result: 1800 },
      company: {
        income: 3000,
        commission: 300,
        allocated: 200,
        overhead: 100,
        awaiting: 0,
        result: 2400,
      },
      commission: { richard: 90, anastasia: 110, jeanClaude: 100 },
    });

    const toMe = deps.telegram.sent.filter((m) => m.chatId === MY_TELEGRAM).map((m) => m.text);
    expect(toMe.some((t) => t.startsWith("Sale S01 approved"))).toBe(true);
    expect(toMe.some((t) => t.startsWith("Expense E01"))).toBe(true);
    // S02 was entered on the website by Anastasia, who has no linked Telegram account.
    expect((await deps.store.getSale("S02"))?.notify_status).toBe("no_recipient");
    // Kevin is linked to this chat now, so the website entry E02 goes there.
    expect(e02.notify_status).toBe("sent");
    expect(deps.telegram.lastTo(MY_TELEGRAM)).toContain("Proposed: Drunk University Friends.");
    expect(deps.telegram.lastTo(MY_TELEGRAM)).toContain("Approved: Respectable Relatives.");

    const sheetS02 = deps.sheets.sales.get("S02");
    expect(sheetS02?.proposed_split).toEqual({ richard: 0, anastasia: 5000, "jean-claude": 5000 });
    expect(sheetS02?.approved_split).toEqual({
      richard: 2000,
      anastasia: 4000,
      "jean-claude": 4000,
    });
    expect(deps.sheets.expenses.get("E02")?.final_allocation).toBe("A");
  });

  it("Test 2: additional entries and decisions give the cumulative results", async () => {
    await submitSale(deps, "jean-claude", {
      ref: "S03",
      customer: "Emma Stonebridge",
      project: "A",
      description: "Premium relatives, including an uncle presented as a surgeon",
      amount: "1500",
      split: split("40", "40", "20"),
    });
    await submitSale(deps, "richard", {
      ref: "S04",
      customer: "Lucas Green",
      project: "B",
      description: "Small group of loud university friends",
      amount: "800",
      split: split("25", "25", "50"),
    });
    await submitSale(deps, "richard", {
      ref: "S05",
      customer: "Mia Brooks",
      project: "B",
      description: "Extra guests and an embarrassing speech",
      amount: "600",
      split: split("100", "0", "0"),
    });
    await submitExpense(deps, "kevin", {
      ref: "E04",
      description: "Replacement costumes after an enthusiastic dance performance",
      category: "Materials",
      amount: "250",
      allocation: "B",
    });
    await submitExpense(deps, "kevin", {
      ref: "E05",
      description: "Minibus for university friends; Kevin selected the wrong project again",
      category: "Travel",
      amount: "90",
      allocation: "A",
    });
    await submitExpense(deps, "kevin", {
      ref: "E06",
      description: "Company telephone subscription",
      category: "Other",
      amount: "60",
      allocation: "Company overhead",
    });
    await submitExpense(deps, "kevin", {
      ref: "E07",
      description: "Emergency replacement clothing; project allocation still needs checking",
      category: "Materials",
      amount: "140",
      allocation: "A",
    });

    await link("jean-claude");
    const s03 = await approveSale(deps, "svetlana", "S03", split("20", "30", "50"));
    expect(s03.notify_status).toBe("sent");
    const s03Text = deps.telegram.lastTo(MY_TELEGRAM) ?? "";
    expect(s03Text).toContain("commission split changed");
    expect(s03Text).toContain("total commission €150.00");
    expect(s03Text).toContain("Richard: 40% → 20% (€30.00)");
    expect(s03Text).toContain("Anastasia: 40% → 30% (€45.00)");
    expect(s03Text).toContain("Jean-Claude: 20% → 50% (€75.00)");

    await approveSale(deps, "svetlana", "S04", null);
    await link("kevin");
    await allocateExpense(deps, "svetlana", "E04", "B");
    await allocateExpense(deps, "svetlana", "E05", "B");
    const e05Text = deps.telegram.lastTo(MY_TELEGRAM) ?? "";
    expect(e05Text).toContain("€90.00");
    expect(e05Text).toContain("Proposed: Respectable Relatives.");
    expect(e05Text).toContain("Approved: Drunk University Friends.");

    expect(euros(await results())).toEqual({
      A: { income: 2500, commission: 250, allocated: 200, result: 2050 },
      B: { income: 2800, commission: 280, allocated: 340, result: 2180 },
      company: {
        income: 5300,
        commission: 530,
        allocated: 540,
        overhead: 160,
        awaiting: 140,
        result: 3930,
      },
      commission: { richard: 140, anastasia: 175, jeanClaude: 215 },
    });
    const full = await results();
    expect(full.pendingSales).toEqual({ count: 1, amount: 60000 });
    expect(full.awaitingExpenses).toEqual({ count: 1, amount: 14000 });
  });

  it("bot submissions after re-linking still notify the original chat", async () => {
    expect((await deps.store.getSale("S01"))?.notify_chat_id).toBe(MY_TELEGRAM);
    expect((await deps.store.getExpense("E01"))?.notify_chat_id).toBe(MY_TELEGRAM);
  });
});
