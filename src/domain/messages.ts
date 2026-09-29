import { splitsEqual, totalCommission } from "@/domain/commission";
import { ALLOCATION_LABELS, PROJECT_NAMES, SHORT_NAMES } from "@/domain/employees";
import { formatEuro, formatPercent } from "@/domain/money";
import type { Allocation, ExpenseRecord, SaleRecord, Split } from "@/domain/types";
import { SALESPEOPLE } from "@/domain/types";

function allocationName(allocation: Allocation): string {
  return allocation === "overhead" ? "Company overhead" : PROJECT_NAMES[allocation];
}

export function splitText(split: Split): string {
  return SALESPEOPLE.map((p) => `${SHORT_NAMES[p]} ${formatPercent(split[p])}`).join(" / ");
}

export function saleSubmittedMessage(sale: SaleRecord): string {
  return [
    `Sale ${sale.ref} recorded.`,
    `Amount: ${formatEuro(sale.amount_cents)}`,
    `Project: ${ALLOCATION_LABELS[sale.project]}`,
    `Customer: ${sale.customer}`,
    `Proposed split: ${splitText(sale.proposed_split)}`,
    "Status: Pending approval",
  ].join("\n");
}

export function expenseSubmittedMessage(expense: ExpenseRecord): string {
  const status =
    expense.status === "allocated"
      ? "Allocated automatically to company overhead"
      : "Awaiting allocation";
  return [
    `Expense ${expense.ref} recorded.`,
    `Amount: ${formatEuro(expense.amount_cents)}`,
    `Description: ${expense.description}`,
    `Proposed allocation: ${ALLOCATION_LABELS[expense.proposed_allocation]}`,
    `Status: ${status}`,
  ].join("\n");
}

export function saleApprovedMessage(sale: SaleRecord): string {
  if (!sale.approved_split || !sale.commission_cents) {
    throw new Error(`Sale ${sale.ref} has no approved split; cannot build approval message`);
  }
  const approved = sale.approved_split;
  const commission = sale.commission_cents;
  const changed = !splitsEqual(sale.proposed_split, approved);
  const lines = SALESPEOPLE.map((p) => {
    const proposed = sale.proposed_split[p];
    const percent =
      proposed === approved[p]
        ? formatPercent(approved[p])
        : `${formatPercent(proposed)} → ${formatPercent(approved[p])}`;
    return `${SHORT_NAMES[p]}: ${percent} (${formatEuro(commission[p])})`;
  });
  const headline = changed
    ? `Sale ${sale.ref} approved — commission split changed.`
    : `Sale ${sale.ref} approved — proposed commission split unchanged.`;
  return [
    headline,
    `Sale ${formatEuro(sale.amount_cents)}; total commission ${formatEuro(totalCommission(commission))}.`,
    ...lines,
  ].join("\n");
}

export function expenseAllocatedMessage(expense: ExpenseRecord): string {
  if (!expense.final_allocation) {
    throw new Error(`Expense ${expense.ref} has no final allocation; cannot build message`);
  }
  const changed = expense.final_allocation !== expense.proposed_allocation;
  const body = `${formatEuro(expense.amount_cents)}: ${expense.description}`;
  if (changed) {
    return [
      `Expense ${expense.ref} — allocation CHANGED.`,
      body,
      `Proposed: ${allocationName(expense.proposed_allocation)}.`,
      `Approved: ${allocationName(expense.final_allocation)}.`,
    ].join("\n");
  }
  return [
    `Expense ${expense.ref} — allocation confirmed as proposed.`,
    body,
    `Final allocation: ${allocationName(expense.final_allocation)}.`,
  ].join("\n");
}
