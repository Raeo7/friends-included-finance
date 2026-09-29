import { totalCommission } from "@/domain/commission";
import type { ExpenseRecord, Project, SaleRecord, Salesperson } from "@/domain/types";
import { SALESPEOPLE } from "@/domain/types";

export interface ProjectResult {
  income: number;
  commission: number;
  allocatedExpenses: number;
  result: number;
}

export interface FinancialResults {
  projects: Record<Project, ProjectResult>;
  company: {
    income: number;
    commission: number;
    allocatedExpenses: number;
    overhead: number;
    awaitingAllocation: number;
    totalExpenses: number;
    result: number;
  };
  commissionBySalesperson: Record<Salesperson, number>;
  pendingSales: { count: number; amount: number };
  awaitingExpenses: { count: number; amount: number };
}

function emptyProject(): ProjectResult {
  return { income: 0, commission: 0, allocatedExpenses: 0, result: 0 };
}

/** All figures in euro cents. Pending sales are excluded; every recorded expense counts. */
export function computeResults(sales: SaleRecord[], expenses: ExpenseRecord[]): FinancialResults {
  const projects: Record<Project, ProjectResult> = { A: emptyProject(), B: emptyProject() };
  const commissionBySalesperson: Record<Salesperson, number> = {
    richard: 0,
    anastasia: 0,
    "jean-claude": 0,
  };
  const pendingSales = { count: 0, amount: 0 };

  for (const sale of sales) {
    if (sale.status !== "approved" || !sale.commission_cents) {
      pendingSales.count += 1;
      pendingSales.amount += sale.amount_cents;
      continue;
    }
    projects[sale.project].income += sale.amount_cents;
    projects[sale.project].commission += totalCommission(sale.commission_cents);
    for (const person of SALESPEOPLE) {
      commissionBySalesperson[person] += sale.commission_cents[person];
    }
  }

  let overhead = 0;
  let totalExpenses = 0;
  const awaitingExpenses = { count: 0, amount: 0 };
  for (const expense of expenses) {
    totalExpenses += expense.amount_cents;
    if (expense.status !== "allocated" || !expense.final_allocation) {
      awaitingExpenses.count += 1;
      awaitingExpenses.amount += expense.amount_cents;
    } else if (expense.final_allocation === "overhead") {
      overhead += expense.amount_cents;
    } else {
      projects[expense.final_allocation].allocatedExpenses += expense.amount_cents;
    }
  }

  for (const project of Object.values(projects)) {
    project.result = project.income - project.commission - project.allocatedExpenses;
  }
  const income = projects.A.income + projects.B.income;
  const commission = projects.A.commission + projects.B.commission;
  return {
    projects,
    company: {
      income,
      commission,
      allocatedExpenses: projects.A.allocatedExpenses + projects.B.allocatedExpenses,
      overhead,
      awaitingAllocation: awaitingExpenses.amount,
      totalExpenses,
      result: income - commission - totalExpenses,
    },
    commissionBySalesperson,
    pendingSales,
    awaitingExpenses,
  };
}
