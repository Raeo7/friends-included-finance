"use client";

import { useState, type FormEvent } from "react";
import { PROJECT_NAMES, nameOf } from "@/domain/employees";
import { saleSubmittedMessage } from "@/domain/messages";
import type { EmployeeId, SaleRecord } from "@/domain/types";
import { ApiError, describeError, post } from "@/components/api";
import { FormResult, type Outcome } from "@/components/FormResult";

const EMPTY = {
  ref: "",
  customer: "",
  project: "A",
  description: "",
  amount: "",
  richard: "",
  anastasia: "",
  jeanClaude: "",
};

export function SaleForm({ actor, onSaved }: { actor: EmployeeId; onSaved: () => Promise<void> }) {
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
      const sale = await post<SaleRecord>("/api/sales", {
        actor,
        sale: {
          ref: form.ref,
          customer: form.customer,
          project: form.project,
          description: form.description,
          amount: form.amount,
          split: {
            richard: form.richard,
            anastasia: form.anastasia,
            "jean-claude": form.jeanClaude,
          },
        },
      });
      setOutcome({ kind: "ok", lines: saleSubmittedMessage(sale).split("\n") });
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
      <h2>New sale</h2>
      <p className="muted">Salesperson: {nameOf(actor)} (identified automatically)</p>
      <div className="grid">
        <label>
          Reference
          <input {...field("ref")} placeholder="e.g. S06" autoComplete="off" />
        </label>
        <label>
          Customer
          <input {...field("customer")} />
        </label>
        <label>
          Project
          <select {...field("project")}>
            <option value="A">A — {PROJECT_NAMES.A}</option>
            <option value="B">B — {PROJECT_NAMES.B}</option>
          </select>
        </label>
        <label>
          Amount (€)
          <input {...field("amount")} inputMode="decimal" placeholder="1000.00" />
        </label>
        <label className="wide">
          Description
          <input {...field("description")} />
        </label>
      </div>
      <fieldset>
        <legend>Proposed commission split of the 10% pool (must total 100%)</legend>
        <div className="grid three">
          <label>
            Richard %<input {...field("richard")} inputMode="decimal" />
          </label>
          <label>
            Anastasia %<input {...field("anastasia")} inputMode="decimal" />
          </label>
          <label>
            Jean-Claude %<input {...field("jeanClaude")} inputMode="decimal" />
          </label>
        </div>
      </fieldset>
      <button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Submit sale"}
      </button>
      <FormResult outcome={outcome} />
    </form>
  );
}
