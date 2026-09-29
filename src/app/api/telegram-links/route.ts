import { getDeps } from "@/server/deps";
import { readJson, respond, text } from "@/server/http";
import { linkTelegram, parseActor, unlinkTelegram } from "@/server/service";

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    await linkTelegram(
      getDeps(),
      parseActor(body["actor"]),
      text(body["telegramUserId"]),
      body["employee"],
    );
    return { ok: true };
  });
}

export async function DELETE(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    await unlinkTelegram(getDeps(), parseActor(body["actor"]), text(body["telegramUserId"]));
    return { ok: true };
  });
}
