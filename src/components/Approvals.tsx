"use client";

import { useState } from "react";
import { calculateCommission, splitsEqual } from "@/domain/commission";
import { ALLOCATION_LABELS, SHORT_NAMES, nameOf } from "@/domain/employees";
import { formatEuro, formatPercent } from "@/domain/money";
import type { Allocation, EmployeeId, ExpenseRecord, SaleRecord } from "@/domain/types";
import { SALESPEOPLE } from "@/domain/types";
import { validateSplit, type RawSplit } from "@/domain/validation";
import type { StateView } from "@/server/service";
import { describeError, post } from "@/components/api";
import { notifyLabel } from "@/components/Records";
import { formatTimestamp as formatTime } from "@/domain/time";

type Feedback = { ok: boolean; text: string } | null;

function toRawSplit(sale: SaleRecord): RawSplit {
  const raw = (bp: number) => formatPercent(bp).replace("%", "");
  return {
    richard: raw(sale.proposed_split.richard),
    anastasia: raw(sale.proposed_split.anastasia),
    "jean-claude": raw(sale.proposed_split["jean-claude"]),
  };
}

function PendingSale({
  sale,
  actor,
  reload,
}: {
  sale: SaleRecord;
  actor: EmployeeId;
  reload: () => Promise<void>;
}) {
  const [split, setSplit] = useState<RawSplit>(() => toRawSplit(sale));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const parsed = validateSplit(split);
  const preview = parsed.ok ? calculateCommission(sale.amount_cents, parsed.value) : null;
  const changed = parsed.ok && !splitsEqual(parsed.value, sale.proposed_split);

  async function approve() {
    setBusy(true);
    try {
      const approved = await post<SaleRecord>("/api/sales/approve", {
        actor,
        ref: sale.ref,
        split: changed ? split : null,
      });
      setFeedback({ ok: true, text: `Approved. Telegram: ${notifyLabel(approved)}` });
      await reload();
    } catch (error) {
      setFeedback({ ok: false, text: describeError(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="decision">
      <header>
        <strong>{sale.ref}</strong> · {formatEuro(sale.amount_cents)} · Project {sale.project} · by{" "}
        {nameOf(sale.salesperson)} via {sale.source === "telegram" ? "Telegram" : "website"} ·{" "}
        {formatTime(sale.submitted_at)}
      </header>
      <p>
        {sale.customer}: {sale.description}
      </p>
      <table className="compact">
        <thead>
          <tr>
            <th scope="col">Salesperson</th>
            <th scope="col">Proposed</th>
            <th scope="col">Final %</th>
            <th scope="col">Commission</th>
          </tr>
        </thead>
        <tbody>
          {SALESPEOPLE.map((p) => (
            <tr key={p}>
              <th scope="row">{SHORT_NAMES[p]}</th>
              <td>{formatPercent(sale.proposed_split[p])}</td>
              <td>
                <input
                  className="percent"
                  aria-label={`${SHORT_NAMES[p]} final percentage for ${sale.ref}`}
                  inputMode="decimal"
                  value={split[p]}
                  onChange={(e) => setSplit((s) => ({ ...s, [p]: e.target.value }))}
                />
              </td>
              <td>{preview ? formatEuro(preview[p]) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!parsed.ok && <p className="alert error">{parsed.errors.join(" ")}</p>}
      <div className="actions">
        <button type="button" disabled={busy || !parsed.ok} onClick={() => void approve()}>
          {changed ? "Approve with changed split" : "Approve proposed split"}
        </button>
        {changed && <span className="badge warn">Split changed from proposal</span>}
      </div>
      {feedback && <p className={`alert ${feedback.ok ? "success" : "error"}`}>{feedback.text}</p>}
    </article>
  );
}

function AwaitingExpense({
  expense,
  actor,
  reload,
}: {
  expense: ExpenseRecord;
  actor: EmployeeId;
  reload: () => Promise<void>;
}) {
  const [allocation, setAllocation] = useState<Allocation>(expense.proposed_allocation);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const changed = allocation !== expense.proposed_allocation;

  async function approve() {
    setBusy(true);
    try {
      const allocated = await post<ExpenseRecord>("/api/expenses/allocate", {
        actor,
        ref: expense.ref,
        allocation,
      });
      setFeedback({ ok: true, text: `Allocated. Telegram: ${notifyLabel(allocated)}` });
      await reload();
    } catch (error) {
      setFeedback({ ok: false, text: describeError(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="decision">
      <header>
        <strong>{expense.ref}</strong> · {formatEuro(expense.amount_cents)} · {expense.category} ·
        by {nameOf(expense.reporter)} via {expense.source === "telegram" ? "Telegram" : "website"} ·{" "}
        {formatTime(expense.submitted_at)}
      </header>
      <p>{expense.description}</p>
      <p>
        Proposed allocation: <strong>{ALLOCATION_LABELS[expense.proposed_allocation]}</strong>
      </p>
      <div className="actions">
        <label>
          Final allocation{" "}
          <select value={allocation} onChange={(e) => setAllocation(e.target.value as Allocation)}>
            {(["A", "B", "overhead"] as const).map((a) => (
              <option key={a} value={a}>
                {ALLOCATION_LABELS[a]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={busy} onClick={() => void approve()}>
          {changed ? "Approve changed allocation" : "Confirm proposed allocation"}
        </button>
        {changed && <span className="badge warn">Allocation changed from proposal</span>}
      </div>
      {feedback && <p className={`alert ${feedback.ok ? "success" : "error"}`}>{feedback.text}</p>}
    </article>
  );
}

export function Approvals({ state, reload }: { state: StateView; reload: () => Promise<void> }) {
  const pendingSales = state.sales.filter((s) => s.status === "pending");
  const awaiting = state.expenses.filter((e) => e.status === "awaiting_allocation");
  return (
    <section className="card">
      <h2>Decisions waiting ({pendingSales.length + awaiting.length})</h2>
      <h3>Pending sales and commission splits</h3>
      {pendingSales.length === 0 && <p className="muted">No pending sales.</p>}
      {pendingSales.map((sale) => (
        <PendingSale key={sale.ref} sale={sale} actor={state.actor} reload={reload} />
      ))}
      <h3>Expenses awaiting allocation</h3>
      {awaiting.length === 0 && <p className="muted">No expenses awaiting allocation.</p>}
      {awaiting.map((e) => (
        <AwaitingExpense key={e.ref} expense={e} actor={state.actor} reload={reload} />
      ))}
    </section>
  );
}
