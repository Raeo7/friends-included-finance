"use client";

import { useState } from "react";
import { ALLOCATION_LABELS, SHORT_NAMES, roleOf } from "@/domain/employees";
import { formatEuro, formatPercent } from "@/domain/money";
import { formatTimestamp } from "@/domain/time";
import type { EmployeeId, ExpenseRecord, SaleRecord, Split } from "@/domain/types";
import { SALESPEOPLE } from "@/domain/types";
import { describeError, post } from "@/components/api";

type Tracked = Pick<SaleRecord, "notify_status" | "notify_chat_id" | "notify_error">;

export function notifyLabel(record: Tracked): string {
  switch (record.notify_status) {
    case "sent":
      return `Sent to chat ${record.notify_chat_id ?? ""}`.trim();
    case "failed":
      return `Failed, not sent (${record.notify_error ?? "unknown error"})`;
    case "no_recipient":
      return "No Telegram recipient linked";
    default:
      return "Not required";
  }
}

const SYNC_LABELS = { synced: "Synced", pending: "Sync pending", failed: "Sync failed" } as const;

function splitCell(split: Split | null): string {
  return split ? SALESPEOPLE.map((p) => formatPercent(split[p])).join(" / ") : "—";
}

interface StatusProps {
  actor: EmployeeId;
  kind: "sale" | "expense";
  record: SaleRecord | ExpenseRecord;
  reload: () => Promise<void>;
}

function StatusCells({ actor, kind, record, reload }: StatusProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isManager = roleOf(actor) === "manager";

  async function retry(target: "sync" | "notify") {
    setBusy(true);
    try {
      await post("/api/retry", { actor, kind, ref: record.ref, target });
      setError(null);
      await reload();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const syncIncomplete = record.sync_status !== "synced";
  const notifyFailed = record.notify_status === "failed" || record.notify_status === "no_recipient";
  const notifyClass = notifyFailed ? "bad" : record.notify_status === "sent" ? "good" : "";
  return (
    <>
      <td>
        <span
          className={`badge ${syncIncomplete ? "bad" : "good"}`}
          title={record.sync_error ?? ""}
        >
          {SYNC_LABELS[record.sync_status]}
        </span>
        {record.sync_error && syncIncomplete && (
          <small className="detail">{record.sync_error}</small>
        )}
        {syncIncomplete && isManager && (
          <button
            type="button"
            className="small"
            disabled={busy}
            onClick={() => void retry("sync")}
          >
            Retry sync
          </button>
        )}
      </td>
      <td>
        <span className={`badge ${notifyClass}`}>{notifyLabel(record)}</span>
        {notifyFailed && isManager && (
          <button
            type="button"
            className="small"
            disabled={busy}
            onClick={() => void retry("notify")}
          >
            Retry notification
          </button>
        )}
        {error && <div className="alert error">{error}</div>}
      </td>
    </>
  );
}

interface TableProps<T> {
  rows: T[];
  actor: EmployeeId;
  title: string;
  reload: () => Promise<void>;
}

export function SalesTable({ rows, actor, title, reload }: TableProps<SaleRecord>) {
  return (
    <section className="card">
      <h2>
        {title} ({rows.length})
      </h2>
      <p className="muted">Splits and commissions are Richard / Anastasia / Jean-Claude.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Ref</th>
              <th scope="col">Submitted</th>
              <th scope="col">Salesperson</th>
              <th scope="col">Customer</th>
              <th scope="col">Project</th>
              <th scope="col">Description</th>
              <th scope="col">Amount</th>
              <th scope="col">Proposed split</th>
              <th scope="col">Approved split</th>
              <th scope="col">Commission earned</th>
              <th scope="col">Status</th>
              <th scope="col">Google Sheets</th>
              <th scope="col">Telegram decision</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.ref}>
                <th scope="row">{s.ref}</th>
                <td>
                  {formatTimestamp(s.submitted_at)}
                  <small className="detail">via {s.source}</small>
                </td>
                <td>{SHORT_NAMES[s.salesperson]}</td>
                <td>{s.customer}</td>
                <td>{s.project}</td>
                <td>{s.description}</td>
                <td className="num">{formatEuro(s.amount_cents)}</td>
                <td>{splitCell(s.proposed_split)}</td>
                <td>{splitCell(s.approved_split)}</td>
                <td className="num">
                  {SALESPEOPLE.map((p) => formatEuro(s.commission_cents?.[p] ?? 0)).join(" / ")}
                </td>
                <td>{s.status === "approved" ? "Approved" : "Pending approval"}</td>
                <StatusCells actor={actor} kind="sale" record={s} reload={reload} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ExpensesTable({ rows, actor, title, reload }: TableProps<ExpenseRecord>) {
  return (
    <section className="card">
      <h2>
        {title} ({rows.length})
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Ref</th>
              <th scope="col">Submitted</th>
              <th scope="col">Reporter</th>
              <th scope="col">Description</th>
              <th scope="col">Category</th>
              <th scope="col">Amount</th>
              <th scope="col">Proposed allocation</th>
              <th scope="col">Final allocation</th>
              <th scope="col">Status</th>
              <th scope="col">Google Sheets</th>
              <th scope="col">Telegram decision</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.ref}>
                <th scope="row">{e.ref}</th>
                <td>
                  {formatTimestamp(e.submitted_at)}
                  <small className="detail">via {e.source}</small>
                </td>
                <td>{SHORT_NAMES[e.reporter]}</td>
                <td>{e.description}</td>
                <td>{e.category}</td>
                <td className="num">{formatEuro(e.amount_cents)}</td>
                <td>{ALLOCATION_LABELS[e.proposed_allocation]}</td>
                <td>
                  {e.final_allocation ? ALLOCATION_LABELS[e.final_allocation] : "—"}
                  {e.final_allocation && e.final_allocation !== e.proposed_allocation && (
                    <span className="badge warn">changed</span>
                  )}
                </td>
                <td>{e.status === "allocated" ? "Allocated" : "Awaiting allocation"}</td>
                <StatusCells actor={actor} kind="expense" record={e} reload={reload} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
