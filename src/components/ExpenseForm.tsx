"use client";

import { useState, type FormEvent } from "react";
import { ALLOCATION_LABELS, EXPENSE_CATEGORIES, nameOf } from "@/domain/employees";
import { expenseSubmittedMessage } from "@/domain/messages";
import type { EmployeeId, ExpenseRecord } from "@/domain/types";
import { ApiError, describeError, post } from "@/components/api";
import { FormResult, type Outcome } from "@/components/FormResult";

const EMPTY = { ref: "", description: "", category: "Materials", amount: "", allocation: "A" };

export function ExpenseForm({
  actor,
  onSaved,
}: {
  actor: EmployeeId;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const field = (name: keyof typeof EMPTY) => ({
    value: form[name],
    onChange: (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [name]: event.target.value })),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const expense = await post<ExpenseRecord>("/api/expenses", { actor, expense: form });
      setOutcome({ kind: "ok", lines: expenseSubmittedMessage(expense).split("\n") });
      setForm(EMPTY);
      await onSaved();
    } catch (error) {
      setOutcome({
        kind: "error",
        message: error instanceof ApiError ? error.message : describeError(error),
        details: error instanceof ApiError ? error.details : [],
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <h2>New expense</h2>
      <p className="muted">Reporter: {nameOf(actor)} (identified automatically)</p>
      <div className="grid">
        <label>
          Reference
          <input {...field("ref")} placeholder="e.g. E08" autoComplete="off" />
        </label>
        <label>
          Amount (€)
          <input {...field("amount")} inputMode="decimal" placeholder="120.00" />
        </label>
        <label>
          Category
          <select {...field("category")}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Proposed allocation
          <select {...field("allocation")}>
            {(["A", "B", "overhead"] as const).map((a) => (
              <option key={a} value={a}>
                {ALLOCATION_LABELS[a]}
              </option>
            ))}
          </select>
        </label>
        <label className="wide">
          Description
          <input {...field("description")} />
        </label>
      </div>
      <button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Submit expense"}
      </button>
      <FormResult outcome={outcome} />
    </form>
  );
}
