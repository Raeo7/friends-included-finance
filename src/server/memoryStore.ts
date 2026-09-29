import type {
  EmployeeId,
  ExpenseRecord,
  SaleRecord,
  Settings,
  TelegramContact,
  TelegramLink,
} from "@/domain/types";
import type { ExpensePatch, SalePatch, Store } from "@/server/ports";

/** In-process Store with the same contract as the Supabase store; used by tests. */
export class MemoryStore implements Store {
  private readonly sales = new Map<string, SaleRecord>();
  private readonly expenses = new Map<string, ExpenseRecord>();
  private readonly links = new Map<string, TelegramLink>();
  private readonly contacts = new Map<string, TelegramContact>();
  private settings: Settings = { simulate_sheets_failure: false, simulate_telegram_failure: false };

  async refExists(ref: string): Promise<boolean> {
    return this.sales.has(ref) || this.expenses.has(ref);
  }

  async insertSale(sale: SaleRecord): Promise<boolean> {
    if (await this.refExists(sale.ref)) return false;
    this.sales.set(sale.ref, structuredClone(sale));
    return true;
  }

  async insertExpense(expense: ExpenseRecord): Promise<boolean> {
    if (await this.refExists(expense.ref)) return false;
    this.expenses.set(expense.ref, structuredClone(expense));
    return true;
  }

  async getSale(ref: string): Promise<SaleRecord | null> {
    const sale = this.sales.get(ref);
    return sale ? structuredClone(sale) : null;
  }

  async getExpense(ref: string): Promise<ExpenseRecord | null> {
    const expense = this.expenses.get(ref);
    return expense ? structuredClone(expense) : null;
  }

  async listSales(): Promise<SaleRecord[]> {
    return [...this.sales.values()].map((s) => structuredClone(s));
  }

  async listExpenses(): Promise<ExpenseRecord[]> {
    return [...this.expenses.values()].map((e) => structuredClone(e));
  }

  async decideSale(ref: string, patch: SalePatch): Promise<SaleRecord | null> {
    const sale = this.sales.get(ref);
    if (!sale || sale.status !== "pending") return null;
    return this.patchSale(ref, patch);
  }

  async decideExpense(ref: string, patch: ExpensePatch): Promise<ExpenseRecord | null> {
    const expense = this.expenses.get(ref);
    if (!expense || expense.status !== "awaiting_allocation") return null;
    return this.patchExpense(ref, patch);
  }

  async patchSale(ref: string, patch: SalePatch): Promise<SaleRecord> {
    const sale = this.sales.get(ref);
    if (!sale) throw new Error(`Sale ${ref} not found`);
    const updated = { ...sale, ...structuredClone(patch) };
    this.sales.set(ref, updated);
    return structuredClone(updated);
  }

  async patchExpense(ref: string, patch: ExpensePatch): Promise<ExpenseRecord> {
    const expense = this.expenses.get(ref);
    if (!expense) throw new Error(`Expense ${ref} not found`);
    const updated = { ...expense, ...structuredClone(patch) };
    this.expenses.set(ref, updated);
    return structuredClone(updated);
  }

  async getLinkByTelegramUser(telegramUserId: string): Promise<TelegramLink | null> {
    return this.links.get(telegramUserId) ?? null;
  }

  async getLinkByEmployee(employeeId: EmployeeId): Promise<TelegramLink | null> {
    return [...this.links.values()].find((l) => l.employee_id === employeeId) ?? null;
  }

  async setLink(link: TelegramLink): Promise<void> {
    for (const [userId, existing] of this.links) {
      if (existing.employee_id === link.employee_id) this.links.delete(userId);
    }
    this.links.set(link.telegram_user_id, { ...link });
  }

  async removeLink(telegramUserId: string): Promise<void> {
    this.links.delete(telegramUserId);
  }

  async listLinks(): Promise<TelegramLink[]> {
    return [...this.links.values()];
  }

  async upsertContact(contact: TelegramContact): Promise<void> {
    this.contacts.set(contact.telegram_user_id, { ...contact });
  }

  async getContact(telegramUserId: string): Promise<TelegramContact | null> {
    return this.contacts.get(telegramUserId) ?? null;
  }

  async listContacts(): Promise<TelegramContact[]> {
    return [...this.contacts.values()];
  }

  async getSettings(): Promise<Settings> {
    return { ...this.settings };
  }

  async saveSettings(settings: Settings): Promise<void> {
    this.settings = { ...settings };
  }
}
