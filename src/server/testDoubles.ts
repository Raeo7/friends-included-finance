import type { ExpenseRecord, SaleRecord } from "@/domain/types";
import { MemoryStore } from "@/server/memoryStore";
import type { Deps, SheetsPort, TelegramPort } from "@/server/ports";

export class FakeSheets implements SheetsPort {
  readonly sales = new Map<string, SaleRecord>();
  readonly expenses = new Map<string, ExpenseRecord>();
  writes = 0;
  failing = false;

  async upsertSale(sale: SaleRecord): Promise<void> {
    if (this.failing) throw new Error("Sheets API unavailable");
    this.writes += 1;
    this.sales.set(sale.ref, structuredClone(sale));
  }

  async upsertExpense(expense: ExpenseRecord): Promise<void> {
    if (this.failing) throw new Error("Sheets API unavailable");
    this.writes += 1;
    this.expenses.set(expense.ref, structuredClone(expense));
  }
}

export class FakeTelegram implements TelegramPort {
  readonly sent: { chatId: string; text: string }[] = [];
  readonly failingChats = new Set<string>();

  async sendMessage(chatId: string, text: string): Promise<void> {
    if (this.failingChats.has(chatId)) throw new Error("Forbidden: bot was blocked by the user");
    this.sent.push({ chatId, text });
  }

  lastTo(chatId: string): string | undefined {
    return this.sent.filter((m) => m.chatId === chatId).at(-1)?.text;
  }
}

export function createTestDeps(): Deps & {
  store: MemoryStore;
  sheets: FakeSheets;
  telegram: FakeTelegram;
} {
  let tick = Date.parse("2026-09-29T08:00:00Z");
  return {
    store: new MemoryStore(),
    sheets: new FakeSheets(),
    telegram: new FakeTelegram(),
    now: () => new Date((tick += 60_000)),
  };
}
