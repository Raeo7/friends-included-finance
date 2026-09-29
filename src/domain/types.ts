export const SALESPEOPLE = ["richard", "anastasia", "jean-claude"] as const;
export type Salesperson = (typeof SALESPEOPLE)[number];

export const EMPLOYEE_IDS = [...SALESPEOPLE, "kevin", "svetlana"] as const;
export type EmployeeId = (typeof EMPLOYEE_IDS)[number];

export type Role = "salesperson" | "expense_reporter" | "manager";

export type Project = "A" | "B";
export type Allocation = Project | "overhead";
export type ExpenseCategory = "Materials" | "Travel" | "Other";

export type Source = "telegram" | "web";
export type SyncStatus = "pending" | "synced" | "failed";
export type NotifyStatus = "not_required" | "sent" | "failed" | "no_recipient";

/** Percentages stored in basis points of a percent: 5000 = 50.00%. */
export interface Split {
  richard: number;
  anastasia: number;
  "jean-claude": number;
}

/** Commission amounts in euro cents per salesperson. */
export type CommissionCents = Split;

export interface SaleRecord {
  ref: string;
  submitted_at: string;
  salesperson: Salesperson;
  customer: string;
  project: Project;
  description: string;
  amount_cents: number;
  proposed_split: Split;
  approved_split: Split | null;
  commission_cents: CommissionCents | null;
  status: "pending" | "approved";
  decided_at: string | null;
  source: Source;
  origin_chat_id: string | null;
  notify_status: NotifyStatus;
  notify_chat_id: string | null;
  notify_error: string | null;
  sync_status: SyncStatus;
  sync_error: string | null;
}

export interface ExpenseRecord {
  ref: string;
  submitted_at: string;
  reporter: EmployeeId;
  description: string;
  category: ExpenseCategory;
  amount_cents: number;
  proposed_allocation: Allocation;
  final_allocation: Allocation | null;
  status: "awaiting_allocation" | "allocated";
  decided_at: string | null;
  source: Source;
  origin_chat_id: string | null;
  notify_status: NotifyStatus;
  notify_chat_id: string | null;
  notify_error: string | null;
  sync_status: SyncStatus;
  sync_error: string | null;
}

export interface TelegramLink {
  telegram_user_id: string;
  employee_id: EmployeeId;
  chat_id: string;
  linked_at: string;
}

export interface TelegramContact {
  telegram_user_id: string;
  chat_id: string;
  display_name: string;
  last_seen_at: string;
}

export interface Settings {
  simulate_sheets_failure: boolean;
  simulate_telegram_failure: boolean;
}
