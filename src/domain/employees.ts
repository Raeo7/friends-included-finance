import type {
  Allocation,
  EmployeeId,
  ExpenseCategory,
  Project,
  Role,
  Salesperson,
} from "@/domain/types";
import { EMPLOYEE_IDS, SALESPEOPLE } from "@/domain/types";

interface Employee {
  id: EmployeeId;
  name: string;
  role: Role;
}

export const EMPLOYEES: readonly Employee[] = [
  { id: "richard", name: "Richard Darling", role: "salesperson" },
  { id: "anastasia", name: "Anastasia Ferrari", role: "salesperson" },
  { id: "jean-claude", name: "Jean-Claude Bērziņš", role: "salesperson" },
  { id: "kevin", name: "Kevin von Whatever", role: "expense_reporter" },
  { id: "svetlana", name: "Svetlana de Monte Carlo", role: "manager" },
];

export const SHORT_NAMES: Record<EmployeeId, string> = {
  richard: "Richard",
  anastasia: "Anastasia",
  "jean-claude": "Jean-Claude",
  kevin: "Kevin",
  svetlana: "Svetlana",
};

export const PROJECT_NAMES: Record<Project, string> = {
  A: "Respectable Relatives",
  B: "Drunk University Friends",
};

export const ALLOCATION_LABELS: Record<Allocation, string> = {
  A: "A - Respectable Relatives",
  B: "B - Drunk University Friends",
  overhead: "Company overhead",
};

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = ["Materials", "Travel", "Other"];

export function isEmployeeId(value: unknown): value is EmployeeId {
  return typeof value === "string" && (EMPLOYEE_IDS as readonly string[]).includes(value);
}

export function isSalesperson(value: unknown): value is Salesperson {
  return typeof value === "string" && (SALESPEOPLE as readonly string[]).includes(value);
}

export function roleOf(id: EmployeeId): Role {
  const employee = EMPLOYEES.find((e) => e.id === id);
  if (!employee) {
    throw new Error(`Unknown employee id "${id}"`);
  }
  return employee.role;
}

export function nameOf(id: EmployeeId): string {
  return EMPLOYEES.find((e) => e.id === id)?.name ?? id;
}
