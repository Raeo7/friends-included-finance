"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { EMPLOYEES, isEmployeeId, roleOf } from "@/domain/employees";
import type { EmployeeId } from "@/domain/types";
import type { StateView } from "@/server/service";
import { describeError, fetchState } from "@/components/api";
import { Approvals } from "@/components/Approvals";
import { Dashboard } from "@/components/Dashboard";
import { ExpenseForm } from "@/components/ExpenseForm";
import { ManagerSetup } from "@/components/ManagerSetup";
import { PermissionTests } from "@/components/PermissionTests";
import { ExpensesTable, SalesTable } from "@/components/Records";
import { SaleForm } from "@/components/SaleForm";

const ROLE_KEY = "friends-included-role";
const ROLE_EVENT = "friends-included-role-change";

/** Fallback when browser storage is blocked; the role then lasts for this page view only. */
let unsavedRole: EmployeeId = "svetlana";

function readSavedRole(): EmployeeId {
  try {
    const saved = window.localStorage.getItem(ROLE_KEY);
    return isEmployeeId(saved) ? saved : unsavedRole;
  } catch {
    return unsavedRole;
  }
}

function saveRole(id: EmployeeId): void {
  unsavedRole = id;
  try {
    window.localStorage.setItem(ROLE_KEY, id);
  } catch {
    // Storage blocked (private window): unsavedRole keeps the choice for this page view.
  }
  window.dispatchEvent(new Event(ROLE_EVENT));
}

function subscribeToRole(onChange: () => void): () => void {
  window.addEventListener(ROLE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(ROLE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function RoleSelector({
  actor,
  onChange,
}: {
  actor: EmployeeId;
  onChange: (id: EmployeeId) => void;
}) {
  return (
    <label className="role-selector">
      <span>Demonstration role</span>
      <select
        value={actor}
        onChange={(event) => {
          if (isEmployeeId(event.target.value)) onChange(event.target.value);
        }}
      >
        {EMPLOYEES.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.name} — {employee.role.replace("_", " ")}
          </option>
        ))}
      </select>
    </label>
  );
}

function RoleView({ state, reload }: { state: StateView; reload: () => Promise<void> }) {
  const role = roleOf(state.actor);
  if (role === "manager" && state.manager) {
    return (
      <>
        <Dashboard results={state.manager.results} />
        <Approvals state={state} reload={reload} />
        <SalesTable rows={state.sales} actor={state.actor} title="All sales" reload={reload} />
        <ExpensesTable
          rows={state.expenses}
          actor={state.actor}
          title="All expenses"
          reload={reload}
        />
        <ManagerSetup manager={state.manager} actor={state.actor} reload={reload} />
      </>
    );
  }
  return (
    <>
      {role === "salesperson" ? (
        <>
          <SaleForm actor={state.actor} onSaved={reload} />
          <SalesTable rows={state.sales} actor={state.actor} title="My sales" reload={reload} />
        </>
      ) : (
        <>
          <ExpenseForm actor={state.actor} onSaved={reload} />
          <ExpensesTable
            rows={state.expenses}
            actor={state.actor}
            title="My expenses"
            reload={reload}
          />
        </>
      )}
      <PermissionTests actor={state.actor} />
    </>
  );
}

export function App() {
  const actor = useSyncExternalStore(subscribeToRole, readSavedRole, () => null);
  const [state, setState] = useState<StateView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!actor) return;
    try {
      setState(await fetchState(actor));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, [actor]);

  useEffect(() => {
    if (!actor) return;
    let cancelled = false;
    fetchState(actor).then(
      (loaded) => {
        if (cancelled) return;
        setState(loaded);
        setError(null);
      },
      (err: unknown) => {
        if (!cancelled) setError(describeError(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [actor]);

  const current = state && state.actor === actor ? state : null;
  return (
    <section className="app">
      <div className="toolbar">
        {actor && <RoleSelector actor={actor} onChange={saveRole} />}
        <button type="button" className="secondary" onClick={() => void reload()}>
          Refresh
        </button>
      </div>
      {error && <p className="alert error">Could not load data: {error}</p>}
      {!current && !error && <p className="muted">Loading…</p>}
      {current && <RoleView state={current} reload={reload} />}
    </section>
  );
}
