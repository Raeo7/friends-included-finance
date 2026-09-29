import type { TelegramPort } from "@/server/ports";

const REQUEST_TIMEOUT_MS = 8000;

export class TelegramApi implements TelegramPort {
  constructor(private readonly botToken: string) {}

  async call(method: string, payload: Record<string, unknown>): Promise<unknown> {
    const response = await fetch(`https://api.telegram.org/bot${this.botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      description?: string;
      result?: unknown;
    } | null;
    if (!response.ok || !body?.ok) {
      throw new Error(
        `Telegram ${method} failed (${response.status}): ${body?.description ?? "no response body"}`,
      );
    }
    return body.result;
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    await this.call("sendMessage", { chat_id: chatId, text });
  }
}
