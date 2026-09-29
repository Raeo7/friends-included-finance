import type {
  EmployeeId,
  ExpenseRecord,
  SaleRecord,
  Settings,
  TelegramContact,
  TelegramLink,
} from "@/domain/types";

export type SalePatch = Partial<Omit<SaleRecord, "ref">>;
export type ExpensePatch = Partial<Omit<ExpenseRecord, "ref">>;

/** Persistence boundary. Supabase in production, in-memory in tests. */
export interface Store {
  refExists(ref: string): Promise<boolean>;
  /** Returns false when the reference already exists as a sale or an expense. */
  insertSale(sale: SaleRecord): Promise<boolean>;
  insertExpense(expense: ExpenseRecord): Promise<boolean>;
  getSale(ref: string): Promise<SaleRecord | null>;
  getExpense(ref: string): Promise<ExpenseRecord | null>;
  listSales(): Promise<SaleRecord[]>;
  listExpenses(): Promise<ExpenseRecord[]>;
  /** Atomically applies the decision only while the sale is still pending; null otherwise. */
  decideSale(ref: string, patch: SalePatch): Promise<SaleRecord | null>;
  /** Atomically applies the decision only while the expense awaits allocation; null otherwise. */
  decideExpense(ref: string, patch: ExpensePatch): Promise<ExpenseRecord | null>;
  patchSale(ref: string, patch: SalePatch): Promise<SaleRecord>;
  patchExpense(ref: string, patch: ExpensePatch): Promise<ExpenseRecord>;

  getLinkByTelegramUser(telegramUserId: string): Promise<TelegramLink | null>;
  getLinkByEmployee(employeeId: EmployeeId): Promise<TelegramLink | null>;
  /** Links the Telegram user to the employee, replacing any earlier link of either side. */
  setLink(link: TelegramLink): Promise<void>;
  removeLink(telegramUserId: string): Promise<void>;
  listLinks(): Promise<TelegramLink[]>;
  upsertContact(contact: TelegramContact): Promise<void>;
  getContact(telegramUserId: string): Promise<TelegramContact | null>;
  listContacts(): Promise<TelegramContact[]>;

  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
}

export interface SheetsPort {
  upsertSale(sale: SaleRecord): Promise<void>;
  upsertExpense(expense: ExpenseRecord): Promise<void>;
}

export interface TelegramPort {
  sendMessage(chatId: string, text: string): Promise<void>;
}

export interface Deps {
  store: Store;
  sheets: SheetsPort;
  telegram: TelegramPort;
  now: () => Date;
}
