import { getDeps } from "@/server/deps";
import { rawSplit, readJson, respond, text } from "@/server/http";
import { approveSale, parseActor } from "@/server/service";

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    const split = body["split"] ? rawSplit(body["split"]) : null;
    return approveSale(getDeps(), parseActor(body["actor"]), text(body["ref"]), split);
  });
}
