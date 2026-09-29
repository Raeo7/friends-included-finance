// Points the Telegram bot at the deployed webhook and registers the bot's command menu.
//   pnpm set-webhook https://your-app.vercel.app
const baseUrl = process.argv[2]?.replace(/\/$/, "");
const token = process.env["TELEGRAM_BOT_TOKEN"];
const secret = process.env["TELEGRAM_WEBHOOK_SECRET"];

if (!baseUrl?.startsWith("https://") || !token || !secret) {
  console.error(
    "Usage: pnpm set-webhook https://your-app.vercel.app\n" +
      "Needs TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in .env.local (same values as Vercel).",
  );
  process.exit(1);
}

async function call(method: string, payload: object): Promise<unknown> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as { ok: boolean; description?: string; result?: unknown };
  if (!body.ok) throw new Error(`${method} failed: ${body.description ?? response.status}`);
  return body.result;
}

await call("setWebhook", {
  url: `${baseUrl}/api/telegram`,
  secret_token: secret,
  allowed_updates: ["message"],
  drop_pending_updates: true,
});
await call("setMyCommands", {
  commands: [
    { command: "sale", description: "Submit a sale (salespeople)" },
    { command: "expense", description: "Submit an expense (Kevin)" },
    { command: "my", description: "List my submissions" },
    { command: "help", description: "Show formats and my user ID" },
  ],
});
console.log("Webhook info:", await call("getWebhookInfo", {}));
