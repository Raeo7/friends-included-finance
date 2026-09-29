import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  EmployeeId,
  ExpenseRecord,
  SaleRecord,
  Settings,
  Split,
  TelegramContact,
  TelegramLink,
} from "@/domain/types";
import type { ExpensePatch, SalePatch, Store } from "@/server/ports";

type Row = Record<string, unknown>;

const UNIQUE_VIOLATION = "23505";

function splitColumns(prefix: string, suffix: string, split: Split | null): Row {
  return {
    [`${prefix}_richard_${suffix}`]: split?.richard ?? null,
    [`${prefix}_anastasia_${suffix}`]: split?.anastasia ?? null,
    [`${prefix}_jean_claude_${suffix}`]: split?.["jean-claude"] ?? null,
  };
}

function readSplit(row: Row, prefix: string, suffix: string): Split | null {
  const richard = row[`${prefix}_richard_${suffix}`];
  if (richard === null || richard === undefined) return null;
  return {
    richard: Number(richard),
    anastasia: Number(row[`${prefix}_anastasia_${suffix}`]),
    "jean-claude": Number(row[`${prefix}_jean_claude_${suffix}`]),
  };
}

function saleToRow(patch: SalePatch): Row {
  const { proposed_split, approved_split, commission_cents, ...plain } = patch;
  return {
    ...plain,
    ...(proposed_split !== undefined ? splitColumns("proposed", "bp", proposed_split) : {}),
    ...(approved_split !== undefined ? splitColumns("approved", "bp", approved_split) : {}),
    ...(commission_cents !== undefined
      ? splitColumns("commission", "cents", commission_cents)
      : {}),
  };
}

function rowToSale(row: Row): SaleRecord {
  const proposed = readSplit(row, "proposed", "bp");
  if (!proposed)
    throw new Error(`Sale ${String(row["ref"])} has no proposed split in the database`);
  return {
    ref: String(row["ref"]),
    submitted_at: String(row["submitted_at"]),
    salesperson: row["salesperson"] as SaleRecord["salesperson"],
    customer: String(row["customer"]),
    project: row["project"] as SaleRecord["project"],
    description: String(row["description"]),
    amount_cents: Number(row["amount_cents"]),
    proposed_split: proposed,
    approved_split: readSplit(row, "approved", "bp"),
    commission_cents: readSplit(row, "commission", "cents"),
    status: row["status"] as SaleRecord["status"],
    decided_at: (row["decided_at"] as string | null) ?? null,
    source: row["source"] as SaleRecord["source"],
    origin_chat_id: (row["origin_chat_id"] as string | null) ?? null,
    notify_status: row["notify_status"] as SaleRecord["notify_status"],
    notify_chat_id: (row["notify_chat_id"] as string | null) ?? null,
    notify_error: (row["notify_error"] as string | null) ?? null,
    sync_status: row["sync_status"] as SaleRecord["sync_status"],
    sync_error: (row["sync_error"] as string | null) ?? null,
  };
}

function rowToExpense(row: Row): ExpenseRecord {
  return { ...(row as unknown as ExpenseRecord), amount_cents: Number(row["amount_cents"]) };
}

function fail(operation: string, error: { message: string; code?: string }): never {
  throw new Error(
    `Supabase ${operation} failed: ${error.message}${error.code ? ` (${error.code})` : ""}`,
  );
}

export class SupabaseStore implements Store {
  constructor(private readonly db: SupabaseClient) {}

  static fromEnv(url: string, serviceRoleKey: string): SupabaseStore {
    return new SupabaseStore(
      createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    );
  }

  async refExists(ref: string): Promise<boolean> {
    const [sale, expense] = await Promise.all([this.getSale(ref), this.getExpense(ref)]);
    return sale !== null || expense !== null;
  }

  async insertSale(sale: SaleRecord): Promise<boolean> {
    const { error } = await this.db.from("sales").insert(saleToRow(sale));
    if (error?.code === UNIQUE_VIOLATION) return false;
    if (error) fail(`insert sale ${sale.ref}`, error);
    return true;
  }

  async insertExpense(expense: ExpenseRecord): Promise<boolean> {
    const { error } = await this.db.from("expenses").insert(expense);
    if (error?.code === UNIQUE_VIOLATION) return false;
    if (error) fail(`insert expense ${expense.ref}`, error);
    return true;
  }

  async getSale(ref: string): Promise<SaleRecord | null> {
    const { data, error } = await this.db.from("sales").select("*").eq("ref", ref).maybeSingle();
    if (error) fail(`read sale ${ref}`, error);
    return data ? rowToSale(data) : null;
  }

  async getExpense(ref: string): Promise<ExpenseRecord | null> {
    const { data, error } = await this.db.from("expenses").select("*").eq("ref", ref).maybeSingle();
    if (error) fail(`read expense ${ref}`, error);
    return data ? rowToExpense(data) : null;
  }

  async listSales(): Promise<SaleRecord[]> {
    const { data, error } = await this.db.from("sales").select("*").order("submitted_at");
    if (error) fail("list sales", error);
    return data.map(rowToSale);
  }

  async listExpenses(): Promise<ExpenseRecord[]> {
    const { data, error } = await this.db.from("expenses").select("*").order("submitted_at");
    if (error) fail("list expenses", error);
    return data.map(rowToExpense);
  }

  async decideSale(ref: string, patch: SalePatch): Promise<SaleRecord | null> {
    const { data, error } = await this.db
      .from("sales")
      .update(saleToRow(patch))
      .eq("ref", ref)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    if (error) fail(`approve sale ${ref}`, error);
    return data ? rowToSale(data) : null;
  }

  async decideExpense(ref: string, patch: ExpensePatch): Promise<ExpenseRecord | null> {
    const { data, error } = await this.db
      .from("expenses")
      .update(patch)
      .eq("ref", ref)
      .eq("status", "awaiting_allocation")
      .select("*")
      .maybeSingle();
    if (error) fail(`allocate expense ${ref}`, error);
    return data ? rowToExpense(data) : null;
  }

  async patchSale(ref: string, patch: SalePatch): Promise<SaleRecord> {
    const { data, error } = await this.db
      .from("sales")
      .update(saleToRow(patch))
      .eq("ref", ref)
      .select("*")
      .single();
    if (error) fail(`update sale ${ref}`, error);
    return rowToSale(data);
  }

  async patchExpense(ref: string, patch: ExpensePatch): Promise<ExpenseRecord> {
    const { data, error } = await this.db
      .from("expenses")
      .update(patch)
      .eq("ref", ref)
      .select("*")
      .single();
    if (error) fail(`update expense ${ref}`, error);
    return rowToExpense(data);
  }

  async getLinkByTelegramUser(telegramUserId: string): Promise<TelegramLink | null> {
    const { data, error } = await this.db
      .from("telegram_links")
      .select("*")
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();
    if (error) fail("read Telegram link", error);
    return data as TelegramLink | null;
  }

  async getLinkByEmployee(employeeId: EmployeeId): Promise<TelegramLink | null> {
    const { data, error } = await this.db
      .from("telegram_links")
      .select("*")
      .eq("employee_id", employeeId)
      .maybeSingle();
    if (error) fail("read Telegram link", error);
    return data as TelegramLink | null;
  }

  async setLink(link: TelegramLink): Promise<void> {
    const removed = await this.db
      .from("telegram_links")
      .delete()
      .eq("employee_id", link.employee_id)
      .neq("telegram_user_id", link.telegram_user_id);
    if (removed.error) fail("replace Telegram link", removed.error);
    const { error } = await this.db.from("telegram_links").upsert(link);
    if (error) fail("save Telegram link", error);
  }

  async removeLink(telegramUserId: string): Promise<void> {
    const { error } = await this.db
      .from("telegram_links")
      .delete()
      .eq("telegram_user_id", telegramUserId);
    if (error) fail("remove Telegram link", error);
  }

  async listLinks(): Promise<TelegramLink[]> {
    const { data, error } = await this.db.from("telegram_links").select("*").order("linked_at");
    if (error) fail("list Telegram links", error);
    return data as TelegramLink[];
  }

  async upsertContact(contact: TelegramContact): Promise<void> {
    const { error } = await this.db.from("telegram_contacts").upsert(contact);
    if (error) fail("save Telegram contact", error);
  }

  async getContact(telegramUserId: string): Promise<TelegramContact | null> {
    const { data, error } = await this.db
      .from("telegram_contacts")
      .select("*")
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();
    if (error) fail("read Telegram contact", error);
    return data as TelegramContact | null;
  }

  async listContacts(): Promise<TelegramContact[]> {
    const { data, error } = await this.db
      .from("telegram_contacts")
      .select("*")
      .order("last_seen_at", { ascending: false });
    if (error) fail("list Telegram contacts", error);
    return data as TelegramContact[];
  }

  async getSettings(): Promise<Settings> {
    const { data, error } = await this.db
      .from("settings")
      .select("simulate_sheets_failure, simulate_telegram_failure")
      .eq("id", 1)
      .maybeSingle();
    if (error) fail("read settings", error);
    return data ?? { simulate_sheets_failure: false, simulate_telegram_failure: false };
  }

  async saveSettings(settings: Settings): Promise<void> {
    const { error } = await this.db.from("settings").upsert({ id: 1, ...settings });
    if (error) fail("save settings", error);
  }
}
