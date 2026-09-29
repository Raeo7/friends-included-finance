import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { handleTelegramUpdate, type TelegramUpdate } from "@/server/bot";
import { getDeps, telegramWebhookSecret } from "@/server/deps";

function secretMatches(received: string | null): boolean {
  const expected = Buffer.from(telegramWebhookSecret());
  const actual = Buffer.from(received ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Telegram webhook. Only requests carrying the secret set via setWebhook are processed. */
export async function POST(request: Request) {
  if (!secretMatches(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const update = (await request.json()) as TelegramUpdate;
  try {
    await handleTelegramUpdate(getDeps(), update);
  } catch (error) {
    console.error(`Telegram update ${update.update_id} failed`, error);
  }
  return NextResponse.json({ ok: true });
}
