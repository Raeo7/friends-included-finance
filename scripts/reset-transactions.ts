// Deletes every sale and expense in Supabase and clears the data rows of the Sales and Expenses
// tabs. Telegram links and contacts are kept. Run before Test 1 to remove practice transactions:
//   pnpm reset-transactions --yes
import { createSign } from "node:crypto";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env.local`);
  return value;
}

async function clearSupabase(table: string): Promise<void> {
  const response = await fetch(`${env("SUPABASE_URL")}/rest/v1/${table}?ref=not.is.null`, {
    method: "DELETE",
    headers: {
      apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
      Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Deleting ${table} failed (${response.status}): ${await response.text()}`);
  }
}

async function googleToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: env("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 600,
  })}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(env("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"))
    .toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!response.ok) throw new Error(`Google token failed: ${await response.text()}`);
  return ((await response.json()) as { access_token: string }).access_token;
}

async function clearSheetRows(): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env("GOOGLE_SHEET_ID")}/values:batchClear`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${await googleToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ranges: ["Sales!A2:Z", "Expenses!A2:Z"] }),
  });
  if (!response.ok) throw new Error(`Clearing sheet rows failed: ${await response.text()}`);
}

if (!process.argv.includes("--yes")) {
  console.error("This deletes ALL sales and expenses. Re-run with --yes to confirm.");
  process.exit(1);
}
await clearSupabase("sales");
await clearSupabase("expenses");
await clearSheetRows();
console.log("All transactions deleted from Supabase and the Sales/Expenses tabs cleared.");
