"use client";

import { useState, type FormEvent } from "react";
import { EMPLOYEES, nameOf } from "@/domain/employees";
import { formatTimestamp } from "@/domain/time";
import type { EmployeeId, Settings } from "@/domain/types";
import type { ManagerView } from "@/server/service";
import { describeError, post } from "@/components/api";

interface Props {
  manager: ManagerView;
  actor: EmployeeId;
  reload: () => Promise<void>;
}

function EmployeeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Employee">
      <option value="">Choose employee…</option>
      {EMPLOYEES.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
        </option>
      ))}
    </select>
  );
}

export function ManagerSetup({ manager, actor, reload }: Props) {
  const [userId, setUserId] = useState("");
  const [employee, setEmployee] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      setMessage({ ok: true, text: success });
      await reload();
    } catch (error) {
      setMessage({ ok: false, text: describeError(error) });
    }
  }

  function link(event: FormEvent) {
    event.preventDefault();
    void run(
      () => post("/api/telegram-links", { actor, telegramUserId: userId, employee }),
      `Telegram user ${userId} is now linked to ${employee ? nameOf(employee as EmployeeId) : ""}.`,
    );
  }

  function unlink(telegramUserId: string) {
    void run(
      () => post("/api/telegram-links", { actor, telegramUserId }, "DELETE"),
      `Telegram user ${telegramUserId} unlinked.`,
    );
  }

  function toggle(key: keyof Settings, value: boolean) {
    void run(
      () => post("/api/settings", { actor, settings: { ...manager.settings, [key]: value } }),
      "Integration test settings saved.",
    );
  }

  return (
    <section className="card">
      <h2>Manager setup: Telegram links</h2>
      <p className="muted">
        People identify themselves in the bot by Telegram user ID. Only the manager can link an ID
        to an employee; the bot cannot assign roles. Earlier bot submissions keep notifying the chat
        they came from even after a link changes.
      </p>

      <h3>Current links</h3>
      {manager.links.length === 0 && <p className="muted">No Telegram accounts linked.</p>}
      <ul className="plain">
        {manager.links.map((l) => (
          <li key={l.telegram_user_id}>
            <strong>{nameOf(l.employee_id)}</strong> ← Telegram user {l.telegram_user_id} (chat{" "}
            {l.chat_id}), linked {formatTimestamp(l.linked_at)}{" "}
            <button
              type="button"
              className="small secondary"
              onClick={() => unlink(l.telegram_user_id)}
            >
              Unlink
            </button>
          </li>
        ))}
      </ul>

      <h3>Link a Telegram user</h3>
      <form className="inline-form" onSubmit={link}>
        <label>
          Telegram user ID
          <input value={userId} onChange={(e) => setUserId(e.target.value)} inputMode="numeric" />
        </label>
        <EmployeeSelect value={employee} onChange={setEmployee} />
        <button type="submit">Save link</button>
      </form>

      <h3>People who started the bot</h3>
      {manager.contacts.length === 0 && (
        <p className="muted">Nobody yet. Send /start to the bot and refresh.</p>
      )}
      <ul className="plain">
        {manager.contacts.map((c) => (
          <li key={c.telegram_user_id}>
            {c.display_name}: user ID <code>{c.telegram_user_id}</code>, last seen{" "}
            {formatTimestamp(c.last_seen_at)}{" "}
            <button
              type="button"
              className="small secondary"
              onClick={() => setUserId(c.telegram_user_id)}
            >
              Use this ID
            </button>
          </li>
        ))}
      </ul>

      <h3>Integration failure tests</h3>
      <p className="muted">
        Simulate an outage to check that transactions stay saved, records show the failure, and
        retry repairs the same Sheets row or resends the notification. Turn off before normal use.
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={manager.settings.simulate_sheets_failure}
          onChange={(e) => toggle("simulate_sheets_failure", e.target.checked)}
        />
        Simulate Google Sheets outage
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={manager.settings.simulate_telegram_failure}
          onChange={(e) => toggle("simulate_telegram_failure", e.target.checked)}
        />
        Simulate Telegram delivery failure
      </label>

      {message && <p className={`alert ${message.ok ? "success" : "error"}`}>{message.text}</p>}
    </section>
  );
}
