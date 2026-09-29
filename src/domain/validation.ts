import { FULL_SPLIT_BP, splitTotalBp } from "@/domain/commission";
import { EXPENSE_CATEGORIES } from "@/domain/employees";
import { MAX_AMOUNT_CENTS, parseEuroToCents, parsePercentToBp } from "@/domain/money";
import type { Allocation, ExpenseCategory, Project, Split } from "@/domain/types";

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export interface RawSplit {
  richard: string;
  anastasia: string;
  "jean-claude": string;
}

export interface RawSale {
  ref: string;
  customer: string;
  project: string;
  description: string;
  amount: string;
  split: RawSplit;
}

export interface RawExpense {
  ref: string;
  description: string;
  category: string;
  amount: string;
  allocation: string;
}

export interface SaleInput {
  ref: string;
  customer: string;
  project: Project;
  description: string;
  amount_cents: number;
  split: Split;
}

export interface ExpenseInput {
  ref: string;
  description: string;
  category: ExpenseCategory;
  amount_cents: number;
  allocation: Allocation;
}

const REF_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,19}$/;
const MAX_TEXT = 500;

export function normalizeRef(raw: string): string {
  return raw.trim().toUpperCase();
}

function checkRef(raw: string, errors: string[]): string {
  const ref = normalizeRef(raw);
  if (ref === "") {
    errors.push("Reference is required (for example S01 or E01).");
  } else if (!REF_PATTERN.test(ref)) {
    errors.push("Reference may use only letters, digits, - and _ (max 20 characters).");
  }
  return ref;
}

function checkText(raw: string, label: string, errors: string[]): string {
  const text = raw.trim();
  if (text === "") {
    errors.push(`${label} is required.`);
  } else if (text.length > MAX_TEXT) {
    errors.push(`${label} must be at most ${MAX_TEXT} characters.`);
  }
  return text;
}

function checkAmount(raw: string, errors: string[]): number {
  if (raw.trim() === "") {
    errors.push("Amount is required.");
    return 0;
  }
  const cents = parseEuroToCents(raw);
  if (cents === null) {
    errors.push(`Amount "${raw.trim()}" is not a number like 1000 or 1000.50.`);
    return 0;
  }
  if (cents <= 0) {
    errors.push("Amount must be greater than zero.");
  } else if (cents > MAX_AMOUNT_CENTS) {
    errors.push("Amount is too large.");
  }
  return cents;
}

export function parseProject(raw: string): Project | null {
  const value = raw.trim().toUpperCase();
  return value === "A" || value === "B" ? value : null;
}

export function parseAllocation(raw: string): Allocation | null {
  const value = raw.trim().toLowerCase();
  if (value === "a" || value === "b") {
    return value.toUpperCase() as Project;
  }
  if (["overhead", "company overhead", "company", "o"].includes(value)) {
    return "overhead";
  }
  return null;
}

function parseCategory(raw: string): ExpenseCategory | null {
  const value = raw.trim().toLowerCase();
  return EXPENSE_CATEGORIES.find((c) => c.toLowerCase() === value) ?? null;
}

export function validateSplit(raw: RawSplit): Validated<Split> {
  const errors: string[] = [];
  const parsed: Partial<Split> = {};
  for (const [person, label] of [
    ["richard", "Richard"],
    ["anastasia", "Anastasia"],
    ["jean-claude", "Jean-Claude"],
  ] as const) {
    const text = raw[person].trim();
    const bp = text === "" ? null : parsePercentToBp(text);
    if (bp === null || bp > FULL_SPLIT_BP) {
      errors.push(`${label}'s share must be a percentage from 0 to 100.`);
    } else {
      parsed[person] = bp;
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const split = parsed as Split;
  const total = splitTotalBp(split);
  if (total !== FULL_SPLIT_BP) {
    return {
      ok: false,
      errors: [`Commission shares must total 100%; they total ${total / 100}%.`],
    };
  }
  return { ok: true, value: split };
}

export function validateSale(raw: RawSale): Validated<SaleInput> {
  const errors: string[] = [];
  const ref = checkRef(raw.ref, errors);
  const customer = checkText(raw.customer, "Customer", errors);
  const project = parseProject(raw.project);
  if (!project) {
    errors.push("Project must be A (Respectable Relatives) or B (Drunk University Friends).");
  }
  const description = checkText(raw.description, "Description", errors);
  const amount_cents = checkAmount(raw.amount, errors);
  const split = validateSplit(raw.split);
  if (!split.ok) {
    errors.push(...split.errors);
  }
  if (errors.length > 0 || !project || !split.ok) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: { ref, customer, project, description, amount_cents, split: split.value },
  };
}

export function validateExpense(raw: RawExpense): Validated<ExpenseInput> {
  const errors: string[] = [];
  const ref = checkRef(raw.ref, errors);
  const description = checkText(raw.description, "Description", errors);
  const category = parseCategory(raw.category);
  if (!category) {
    errors.push("Category must be Materials, Travel or Other.");
  }
  const amount_cents = checkAmount(raw.amount, errors);
  const allocation = parseAllocation(raw.allocation);
  if (!allocation) {
    errors.push("Allocation must be A, B or Company overhead.");
  }
  if (errors.length > 0 || !category || !allocation) {
    return { ok: false, errors };
  }
  return { ok: true, value: { ref, description, category, amount_cents, allocation } };
}
