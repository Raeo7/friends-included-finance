import { calculateCommission } from "@/domain/commission";
import { isEmployeeId, isSalesperson, nameOf, roleOf } from "@/domain/employees";
import { expenseAllocatedMessage, saleApprovedMessage } from "@/domain/messages";
import { computeResults, type FinancialResults } from "@/domain/results";
import type {
  Allocation,
  EmployeeId,
  ExpenseRecord,
  Role,
  SaleRecord,
  Settings,
  Source,
  TelegramContact,
  TelegramLink,
} from "@/domain/types";
import {
  normalizeRef,
  parseAllocation,
  validateExpense,
  validateSale,
  validateSplit,
  type RawExpense,
  type RawSale,
  type RawSplit,
} from "@/domain/validation";
import type { Deps } from "@/server/ports";

export class ServiceError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export interface Origin {
  source: Source;
  chatId: string | null;
}

const WEB_ORIGIN: Origin = { source: "web", chatId: null };

function requireRole(actor: EmployeeId, role: Role, action: string): void {
  if (roleOf(actor) !== role) {
    throw new ServiceError(403, `${nameOf(actor)} is not allowed to ${action}.`);
  }
}

export function parseActor(value: unknown): EmployeeId {
  if (!isEmployeeId(value)) {
    throw new ServiceError(400, "Select a demonstration role first.");
  }
  return value;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function syncSale(deps: Deps, sale: SaleRecord): Promise<SaleRecord> {
  try {
    const settings = await deps.store.getSettings();
    if (settings.simulate_sheets_failure) {
      throw new Error("Simulated Google Sheets outage (manager setup toggle)");
    }
    await deps.sheets.upsertSale(sale);
    return await deps.store.patchSale(sale.ref, { sync_status: "synced", sync_error: null });
  } catch (error) {
    return deps.store.patchSale(sale.ref, { sync_status: "failed", sync_error: errorText(error) });
  }
}

async function syncExpense(deps: Deps, expense: ExpenseRecord): Promise<ExpenseRecord> {
  try {
    const settings = await deps.store.getSettings();
    if (settings.simulate_sheets_failure) {
      throw new Error("Simulated Google Sheets outage (manager setup toggle)");
    }
    await deps.sheets.upsertExpense(expense);
    return await deps.store.patchExpense(expense.ref, { sync_status: "synced", sync_error: null });
  } catch (error) {
    return deps.store.patchExpense(expense.ref, {
      sync_status: "failed",
      sync_error: errorText(error),
    });
  }
}

/** Bot submissions go back to the originating chat; web entries to the employee's linked chat. */
async function recipientFor(
  deps: Deps,
  record: { source: Source; origin_chat_id: string | null },
  employee: EmployeeId,
): Promise<string | null> {
  if (record.source === "telegram" && record.origin_chat_id) {
    return record.origin_chat_id;
  }
  const link = await deps.store.getLinkByEmployee(employee);
  return link?.chat_id ?? null;
}

type Delivery = Pick<SaleRecord, "notify_status" | "notify_chat_id" | "notify_error">;

async function deliver(deps: Deps, chatId: string | null, text: string): Promise<Delivery> {
  if (!chatId) {
    return {
      notify_status: "no_recipient",
      notify_chat_id: null,
      notify_error: "No Telegram recipient linked",
    };
  }
  try {
    const settings = await deps.store.getSettings();
    if (settings.simulate_telegram_failure) {
      throw new Error("Simulated Telegram outage (manager setup toggle)");
    }
    await deps.telegram.sendMessage(chatId, text);
    return { notify_status: "sent", notify_chat_id: chatId, notify_error: null };
  } catch (error) {
    return { notify_status: "failed", notify_chat_id: chatId, notify_error: errorText(error) };
  }
}

async function notifySale(deps: Deps, sale: SaleRecord): Promise<SaleRecord> {
  const chatId = await recipientFor(deps, sale, sale.salesperson);
  const delivery = await deliver(deps, chatId, saleApprovedMessage(sale));
  return deps.store.patchSale(sale.ref, delivery);
}

async function notifyExpense(deps: Deps, expense: ExpenseRecord): Promise<ExpenseRecord> {
  const chatId = await recipientFor(deps, expense, expense.reporter);
  const delivery = await deliver(deps, chatId, expenseAllocatedMessage(expense));
  return deps.store.patchExpense(expense.ref, delivery);
}

async function refuseDuplicate(deps: Deps, ref: string): Promise<void> {
  if (await deps.store.refExists(ref)) {
    throw new ServiceError(409, `Reference ${ref} already exists. Use a new reference.`);
  }
}

export async function submitSale(
  deps: Deps,
  actor: EmployeeId,
  raw: RawSale,
  origin: Origin = WEB_ORIGIN,
): Promise<SaleRecord> {
  if (!isSalesperson(actor)) {
    throw new ServiceError(403, `${nameOf(actor)} is not allowed to submit sales.`);
  }
  const input = validateSale(raw);
  if (!input.ok) {
    throw new ServiceError(400, "The sale was not recorded.", input.errors);
  }
  await refuseDuplicate(deps, input.value.ref);
  const sale: SaleRecord = {
    ref: input.value.ref,
    submitted_at: deps.now().toISOString(),
    salesperson: actor,
    customer: input.value.customer,
    project: input.value.project,
    description: input.value.description,
    amount_cents: input.value.amount_cents,
    proposed_split: input.value.split,
    approved_split: null,
    commission_cents: null,
    status: "pending",
    decided_at: null,
    source: origin.source,
    origin_chat_id: origin.chatId,
    notify_status: "not_required",
    notify_chat_id: null,
    notify_error: null,
    sync_status: "pending",
    sync_error: null,
  };
  if (!(await deps.store.insertSale(sale))) {
    throw new ServiceError(409, `Reference ${sale.ref} already exists. Use a new reference.`);
  }
  return syncSale(deps, sale);
}

export async function submitExpense(
  deps: Deps,
  actor: EmployeeId,
  raw: RawExpense,
  origin: Origin = WEB_ORIGIN,
): Promise<ExpenseRecord> {
  requireRole(actor, "expense_reporter", "submit expenses");
  const input = validateExpense(raw);
  if (!input.ok) {
    throw new ServiceError(400, "The expense was not recorded.", input.errors);
  }
  await refuseDuplicate(deps, input.value.ref);
  const isOverhead = input.value.allocation === "overhead";
  const now = deps.now().toISOString();
  const expense: ExpenseRecord = {
    ref: input.value.ref,
    submitted_at: now,
    reporter: actor,
    description: input.value.description,
    category: input.value.category,
    amount_cents: input.value.amount_cents,
    proposed_allocation: input.value.allocation,
    final_allocation: isOverhead ? "overhead" : null,
    status: isOverhead ? "allocated" : "awaiting_allocation",
    decided_at: isOverhead ? now : null,
    source: origin.source,
    origin_chat_id: origin.chatId,
    notify_status: "not_required",
    notify_chat_id: null,
    notify_error: null,
    sync_status: "pending",
    sync_error: null,
  };
  if (!(await deps.store.insertExpense(expense))) {
    throw new ServiceError(409, `Reference ${expense.ref} already exists. Use a new reference.`);
  }
  return syncExpense(deps, expense);
}

/** Approves a pending sale, optionally with a corrected split. Never approves twice. */
export async function approveSale(
  deps: Deps,
  actor: EmployeeId,
  rawRef: string,
  correctedSplit: RawSplit | null,
): Promise<SaleRecord> {
  requireRole(actor, "manager", "approve sales");
  const ref = normalizeRef(rawRef);
  const existing = await deps.store.getSale(ref);
  if (!existing) {
    throw new ServiceError(404, `Sale ${ref} does not exist.`);
  }
  let split = existing.proposed_split;
  if (correctedSplit) {
    const parsed = validateSplit(correctedSplit);
    if (!parsed.ok) {
      throw new ServiceError(400, `Sale ${ref} was not approved.`, parsed.errors);
    }
    split = parsed.value;
  }
  const decided = await deps.store.decideSale(ref, {
    status: "approved",
    approved_split: split,
    commission_cents: calculateCommission(existing.amount_cents, split),
    decided_at: deps.now().toISOString(),
  });
  if (!decided) {
    throw new ServiceError(409, `Sale ${ref} is already approved; nothing was changed.`);
  }
  const synced = await syncSale(deps, decided);
  return notifySale(deps, synced);
}

export async function allocateExpense(
  deps: Deps,
  actor: EmployeeId,
  rawRef: string,
  rawAllocation: string,
): Promise<ExpenseRecord> {
  requireRole(actor, "manager", "allocate expenses");
  const ref = normalizeRef(rawRef);
  const allocation: Allocation | null = parseAllocation(rawAllocation);
  if (!allocation) {
    throw new ServiceError(400, "Allocation must be A, B or Company overhead.");
  }
  if (!(await deps.store.getExpense(ref))) {
    throw new ServiceError(404, `Expense ${ref} does not exist.`);
  }
  const decided = await deps.store.decideExpense(ref, {
    status: "allocated",
    final_allocation: allocation,
    decided_at: deps.now().toISOString(),
  });
  if (!decided) {
    throw new ServiceError(409, `Expense ${ref} is already allocated; nothing was changed.`);
  }
  const synced = await syncExpense(deps, decided);
  return notifyExpense(deps, synced);
}

export type RecordKind = "sale" | "expense";

export async function retrySync(
  deps: Deps,
  actor: EmployeeId,
  kind: RecordKind,
  rawRef: string,
): Promise<SaleRecord | ExpenseRecord> {
  requireRole(actor, "manager", "retry synchronisation");
  const ref = normalizeRef(rawRef);
  if (kind === "sale") {
    const sale = await deps.store.getSale(ref);
    if (!sale) throw new ServiceError(404, `Sale ${ref} does not exist.`);
    return syncSale(deps, sale);
  }
  const expense = await deps.store.getExpense(ref);
  if (!expense) throw new ServiceError(404, `Expense ${ref} does not exist.`);
  return syncExpense(deps, expense);
}

export async function retryNotification(
  deps: Deps,
  actor: EmployeeId,
  kind: RecordKind,
  rawRef: string,
): Promise<SaleRecord | ExpenseRecord> {
  requireRole(actor, "manager", "retry notifications");
  const ref = normalizeRef(rawRef);
  const record = kind === "sale" ? await deps.store.getSale(ref) : await deps.store.getExpense(ref);
  if (!record) {
    throw new ServiceError(404, `${kind === "sale" ? "Sale" : "Expense"} ${ref} does not exist.`);
  }
  if (record.notify_status !== "failed" && record.notify_status !== "no_recipient") {
    throw new ServiceError(409, `No failed notification to retry for ${ref}.`);
  }
  return kind === "sale"
    ? notifySale(deps, record as SaleRecord)
    : notifyExpense(deps, record as ExpenseRecord);
}

export interface ManagerView {
  results: FinancialResults;
  links: TelegramLink[];
  contacts: TelegramContact[];
  settings: Settings;
}

export interface StateView {
  actor: EmployeeId;
  sales: SaleRecord[];
  expenses: ExpenseRecord[];
  manager: ManagerView | null;
}

/** Employees see only their own submissions; the manager sees everything plus results. */
export async function loadState(deps: Deps, actor: EmployeeId): Promise<StateView> {
  const [sales, expenses] = await Promise.all([deps.store.listSales(), deps.store.listExpenses()]);
  if (roleOf(actor) !== "manager") {
    return {
      actor,
      sales: sales.filter((s) => s.salesperson === actor),
      expenses: expenses.filter((e) => e.reporter === actor),
      manager: null,
    };
  }
  const [links, contacts, settings] = await Promise.all([
    deps.store.listLinks(),
    deps.store.listContacts(),
    deps.store.getSettings(),
  ]);
  return {
    actor,
    sales,
    expenses,
    manager: { results: computeResults(sales, expenses), links, contacts, settings },
  };
}

export async function linkTelegram(
  deps: Deps,
  actor: EmployeeId,
  rawTelegramUserId: string,
  employee: unknown,
): Promise<void> {
  requireRole(actor, "manager", "manage Telegram links");
  const telegramUserId = rawTelegramUserId.trim();
  if (!/^\d{1,20}$/.test(telegramUserId)) {
    throw new ServiceError(400, "Telegram user ID must be a number (the bot shows it on /start).");
  }
  if (!isEmployeeId(employee)) {
    throw new ServiceError(400, "Choose an employee to link.");
  }
  const contact = await deps.store.getContact(telegramUserId);
  await deps.store.setLink({
    telegram_user_id: telegramUserId,
    employee_id: employee,
    chat_id: contact?.chat_id ?? telegramUserId,
    linked_at: deps.now().toISOString(),
  });
}

export async function unlinkTelegram(
  deps: Deps,
  actor: EmployeeId,
  telegramUserId: string,
): Promise<void> {
  requireRole(actor, "manager", "manage Telegram links");
  await deps.store.removeLink(telegramUserId.trim());
}

export async function updateSettings(
  deps: Deps,
  actor: EmployeeId,
  settings: Settings,
): Promise<void> {
  requireRole(actor, "manager", "change integration test settings");
  await deps.store.saveSettings(settings);
}
