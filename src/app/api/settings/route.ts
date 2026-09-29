import { getDeps } from "@/server/deps";
import { object, readJson, respond } from "@/server/http";
import { parseActor, updateSettings } from "@/server/service";

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    const settings = object(body["settings"]);
    await updateSettings(getDeps(), parseActor(body["actor"]), {
      simulate_sheets_failure: settings["simulate_sheets_failure"] === true,
      simulate_telegram_failure: settings["simulate_telegram_failure"] === true,
    });
    return { ok: true };
  });
}
