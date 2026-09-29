import { nameOf, roleOf } from "@/domain/employees";
import { expenseSubmittedMessage, saleSubmittedMessage } from "@/domain/messages";
import { formatEuro } from "@/domain/money";
import { EXPENSE_USAGE, SALE_USAGE, parseBotCommand } from "@/domain/telegramCommands";
import type { EmployeeId } from "@/domain/types";
import type { Deps } from "@/server/ports";
import { ServiceError, loadState, submitExpense, submitSale } from "@/server/service";

export interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    from?: { id: number; first_name?: string; last_name?: string; username?: string };
    text?: string;
  };
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending approval",
  approved: "Approved",
  awaiting_allocation: "Awaiting allocation",
  allocated: "Allocated",
};

function usageFor(employee: EmployeeId): string {
  const role = roleOf(employee);
  if (role === "salesperson") return `Submit a sale:\n${SALE_USAGE}\n\n/my - your submissions`;
  if (role === "expense_reporter") {
    return `Submit an expense:\n${EXPENSE_USAGE}\n\n/my - your submissions`;
  }
  return "Managers approve decisions on the website. /my shows all transactions.";
}

function unlinkedText(userId: string): string {
  return (
    `Your Telegram user ID is ${userId}.\n` +
    "You are not linked to an employee yet, so you cannot submit transactions. " +
    "Ask the manager to link this ID on the website (Manager setup)."
  );
}

async function mySubmissions(deps: Deps, employee: EmployeeId): Promise<string> {
  const state = await loadState(deps, employee);
  const lines = [
    ...state.sales.map(
      (s) => `${s.ref} sale ${formatEuro(s.amount_cents)} - ${STATUS_LABELS[s.status]}`,
    ),
    ...state.expenses.map(
      (e) => `${e.ref} expense ${formatEuro(e.amount_cents)} - ${STATUS_LABELS[e.status]}`,
    ),
  ];
  return lines.length > 0 ? lines.join("\n") : "No submissions yet.";
}

function failureText(error: unknown): string {
  if (error instanceof ServiceError) {
    return [`Not recorded: ${error.message}`, ...error.details.map((d) => `- ${d}`)].join("\n");
  }
  return `Not recorded: the system could not save this transaction (${String(error)}). Try again.`;
}

async function replyFor(deps: Deps, text: string, userId: string, chatId: string): Promise<string> {
  const command = parseBotCommand(text);
  const link = await deps.store.getLinkByTelegramUser(userId);
  if (command.kind === "start" || command.kind === "help") {
    return link
      ? `Hello ${nameOf(link.employee_id)} (Telegram user ID ${userId}).\n\n${usageFor(link.employee_id)}`
      : `Welcome to Friends Included finance.\n${unlinkedText(userId)}`;
  }
  if (!link) {
    return unlinkedText(userId);
  }
  const origin = { source: "telegram" as const, chatId };
  switch (command.kind) {
    case "my":
      return mySubmissions(deps, link.employee_id);
    case "sale":
      return saleSubmittedMessage(await submitSale(deps, link.employee_id, command.raw, origin));
    case "expense":
      return expenseSubmittedMessage(
        await submitExpense(deps, link.employee_id, command.raw, origin),
      );
    case "invalid":
      return `Not recorded: ${command.message}`;
    default:
      return `Unknown command.\n\n${usageFor(link.employee_id)}`;
  }
}

/** Handles one Telegram update: identifies the sender by user ID and replies in the same chat. */
export async function handleTelegramUpdate(deps: Deps, update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message?.from || typeof message.text !== "string") {
    return;
  }
  const userId = String(message.from.id);
  const chatId = String(message.chat.id);
  const displayName =
    [message.from.first_name, message.from.last_name].filter(Boolean).join(" ") ||
    message.from.username ||
    userId;
  await deps.store.upsertContact({
    telegram_user_id: userId,
    chat_id: chatId,
    display_name: message.from.username
      ? `${displayName} (@${message.from.username})`
      : displayName,
    last_seen_at: deps.now().toISOString(),
  });
  let reply: string;
  try {
    reply = await replyFor(deps, message.text, userId, chatId);
  } catch (error) {
    reply = failureText(error);
  }
  await deps.telegram.sendMessage(chatId, reply);
}
