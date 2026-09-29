"use client";

import { useState } from "react";
import { nameOf } from "@/domain/employees";
import type { EmployeeId } from "@/domain/types";
import { describeError, post } from "@/components/api";

const PROBE_SALE = {
  ref: "PERMTEST-S",
  customer: "Permission test",
  project: "A",
  description: "Should be refused for this role",
  amount: "100",
  split: { richard: "100", anastasia: "0", "jean-claude": "0" },
};

const PROBE_EXPENSE = {
  ref: "PERMTEST-E",
  description: "Should be refused for this role",
  category: "Other",
  amount: "10",
  allocation: "overhead",
};

/**
 * Sends manager-only or other-role requests as the selected role, so the server-side refusal can
 * be seen from the interface. Hiding buttons is not the enforcement; the API is.
 */
export function PermissionTests({ actor }: { actor: EmployeeId }) {
  const [ref, setRef] = useState("S01");
  const [result, setResult] = useState<string | null>(null);

  async function attempt(label: string, path: string, body: Record<string, unknown>) {
    try {
      await post(path, { actor, ...body });
      setResult(`${label}: ACCEPTED by the server.`);
    } catch (error) {
      setResult(`${label}: refused by the server. ${describeError(error)}`);
    }
  }

  return (
    <details className="card">
      <summary>Permission checks for {nameOf(actor)}</summary>
      <p className="muted">
        These buttons call the API directly as {nameOf(actor)} to show that the server refuses
        actions this role may not perform.
      </p>
      <div className="actions">
        <label>
          Reference{" "}
          <input value={ref} onChange={(e) => setRef(e.target.value)} className="percent" />
        </label>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            void attempt(`Approve sale ${ref}`, "/api/sales/approve", { ref, split: null })
          }
        >
          Try to approve sale
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            void attempt(`Allocate expense ${ref}`, "/api/expenses/allocate", {
              ref,
              allocation: "A",
            })
          }
        >
          Try to allocate expense
        </button>
        {actor === "kevin" && (
          <button
            type="button"
            className="secondary"
            onClick={() => void attempt("Submit a sale", "/api/sales", { sale: PROBE_SALE })}
          >
            Try to submit a sale
          </button>
        )}
        {actor !== "kevin" && (
          <button
            type="button"
            className="secondary"
            onClick={() =>
              void attempt("Submit an expense", "/api/expenses", { expense: PROBE_EXPENSE })
            }
          >
            Try to submit an expense
          </button>
        )}
      </div>
      {result && <p className="alert">{result}</p>}
    </details>
  );
}
