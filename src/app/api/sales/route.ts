import { getDeps } from "@/server/deps";
import { rawSale, readJson, respond } from "@/server/http";
import { parseActor, submitSale } from "@/server/service";

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    return submitSale(getDeps(), parseActor(body["actor"]), rawSale(body["sale"]));
  });
}
