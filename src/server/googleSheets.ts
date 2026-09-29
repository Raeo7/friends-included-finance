import { createSign } from "node:crypto";
import { totalCommission } from "@/domain/commission";
import { ALLOCATION_LABELS, SHORT_NAMES } from "@/domain/employees";
import { formatDecimal, formatPercent } from "@/domain/money";
import { formatTimestamp } from "@/domain/time";
import type { ExpenseRecord, SaleRecord, Split } from "@/domain/types";
import { SALESPEOPLE } from "@/domain/types";
import type { SheetsPort } from "@/server/ports";

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://sheets.googleapis.com/v4/spreadsheets";
const REQUEST_TIMEOUT_MS = 8000;

export const SALES_HEADERS = [
  "Reference",
  "Submission time",
  "Salesperson",
  "Customer",
  "Project",
  "Description",
  "Amount (EUR)",
  "Proposed % Richard",
  "Proposed % Anastasia",
  "Proposed % Jean-Claude",
  "Approved % Richard",
  "Approved % Anastasia",
  "Approved % Jean-Claude",
  "Commission Richard (EUR)",
  "Commission Anastasia (EUR)",
  "Commission Jean-Claude (EUR)",
  "Total commission (EUR)",
  "Status",
];

export const EXPENSE_HEADERS = [
  "Reference",
  "Submission time",
  "Reporter",
  "Description",
  "Category",
  "Amount (EUR)",
  "Proposed allocation",
  "Final allocation",
  "Status",
];

function percents(split: Split | null): string[] {
  return SALESPEOPLE.map((p) => (split ? formatPercent(split[p]) : ""));
}

export function saleRow(sale: SaleRecord): string[] {
  const commission = sale.commission_cents;
  return [
    sale.ref,
    formatTimestamp(sale.submitted_at),
    SHORT_NAMES[sale.salesperson],
    sale.customer,
    ALLOCATION_LABELS[sale.project],
    sale.description,
    formatDecimal(sale.amount_cents),
    ...percents(sale.proposed_split),
    ...percents(sale.approved_split),
    ...SALESPEOPLE.map((p) => formatDecimal(commission ? commission[p] : 0)),
    formatDecimal(commission ? totalCommission(commission) : 0),
    sale.status === "approved" ? "Approved" : "Pending approval",
  ];
}

export function expenseRow(expense: ExpenseRecord): string[] {
  return [
    expense.ref,
    formatTimestamp(expense.submitted_at),
    SHORT_NAMES[expense.reporter],
    expense.description,
    expense.category,
    formatDecimal(expense.amount_cents),
    ALLOCATION_LABELS[expense.proposed_allocation],
    expense.final_allocation ? ALLOCATION_LABELS[expense.final_allocation] : "",
    expense.status === "allocated" ? "Allocated" : "Awaiting allocation",
  ];
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

interface Credentials {
  clientEmail: string;
  privateKey: string;
  spreadsheetId: string;
}

/** Writes one row per transaction reference, updating the existing row when there is one. */
export class GoogleSheets implements SheetsPort {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly credentials: Credentials) {}

  async upsertSale(sale: SaleRecord): Promise<void> {
    await this.upsertRow("Sales", SALES_HEADERS, saleRow(sale));
  }

  async upsertExpense(expense: ExpenseRecord): Promise<void> {
    await this.upsertRow("Expenses", EXPENSE_HEADERS, expenseRow(expense));
  }

  private async accessToken(): Promise<string> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (this.token && this.token.expiresAt > nowSeconds + 60) {
      return this.token.value;
    }
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64url(
      JSON.stringify({
        iss: this.credentials.clientEmail,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: nowSeconds,
        exp: nowSeconds + 3600,
      }),
    );
    const signature = createSign("RSA-SHA256")
      .update(`${header}.${claims}`)
      .sign(this.credentials.privateKey);
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${header}.${claims}.${base64url(signature)}`,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Google token request failed (${response.status}): ${await response.text()}`);
    }
    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: nowSeconds + body.expires_in };
    return body.access_token;
  }

  private async call(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetch(`${API}/${this.credentials.spreadsheetId}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${await this.accessToken()}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `Google Sheets ${init.method ?? "GET"} ${path} failed (${response.status}): ${await response.text()}`,
      );
    }
    return response.json();
  }

  /** Reads column A of the tab, creating the tab first if the spreadsheet does not have it. */
  private async readReferences(tab: string): Promise<string[]> {
    const path = `/values/${encodeURIComponent(`${tab}!A:A`)}`;
    let column: { values?: string[][] };
    try {
      column = (await this.call(path)) as { values?: string[][] };
    } catch (error) {
      if (!String(error).includes("Unable to parse range")) throw error;
      await this.call(":batchUpdate", {
        method: "POST",
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }),
      });
      column = {};
    }
    return (column.values ?? []).map((cells) => cells[0] ?? "");
  }

  private async upsertRow(tab: string, headers: string[], row: string[]): Promise<void> {
    const refs = await this.readReferences(tab);
    const rowIndex = refs.indexOf(row[0] ?? "");
    const data = [{ range: `${tab}!A1`, values: [headers] }];
    if (rowIndex > 0) {
      data.push({ range: `${tab}!A${rowIndex + 1}`, values: [row] });
      await this.call("/values:batchUpdate", {
        method: "POST",
        body: JSON.stringify({ valueInputOption: "RAW", data }),
      });
      return;
    }
    if (refs.length === 0) {
      await this.call("/values:batchUpdate", {
        method: "POST",
        body: JSON.stringify({ valueInputOption: "RAW", data }),
      });
    }
    await this.call(
      `/values/${encodeURIComponent(`${tab}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: "POST", body: JSON.stringify({ values: [row] }) },
    );
  }
}
