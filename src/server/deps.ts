import { GoogleSheets } from "@/server/googleSheets";
import type { Deps } from "@/server/ports";
import { SupabaseStore } from "@/server/supabaseStore";
import { TelegramApi } from "@/server/telegramApi";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Set it in Vercel (Project Settings > Environment Variables) or .env.local.`,
    );
  }
  return value;
}

let cached: Deps | null = null;

export function getDeps(): Deps {
  cached ??= {
    store: SupabaseStore.fromEnv(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    ),
    sheets: new GoogleSheets({
      clientEmail: requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
      privateKey: requireEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
      spreadsheetId: requireEnv("GOOGLE_SHEET_ID"),
    }),
    telegram: new TelegramApi(requireEnv("TELEGRAM_BOT_TOKEN")),
    now: () => new Date(),
  };
  return cached;
}

export function telegramWebhookSecret(): string {
  return requireEnv("TELEGRAM_WEBHOOK_SECRET");
}
