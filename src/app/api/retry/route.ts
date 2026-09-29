import { getDeps } from "@/server/deps";
import { readJson, respond, text } from "@/server/http";
import { ServiceError, parseActor, retryNotification, retrySync } from "@/server/service";

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    const actor = parseActor(body["actor"]);
    const kind = body["kind"];
    if (kind !== "sale" && kind !== "expense") {
      throw new ServiceError(400, 'kind must be "sale" or "expense".');
    }
    const ref = text(body["ref"]);
    if (body["target"] === "sync") return retrySync(getDeps(), actor, kind, ref);
    if (body["target"] === "notify") return retryNotification(getDeps(), actor, kind, ref);
    throw new ServiceError(400, 'target must be "sync" or "notify".');
  });
}
