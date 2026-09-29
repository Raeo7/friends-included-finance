import { getDeps } from "@/server/deps";
import { rawExpense, readJson, respond } from "@/server/http";
import { parseActor, submitExpense } from "@/server/service";

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    return submitExpense(getDeps(), parseActor(body["actor"]), rawExpense(body["expense"]));
  });
}
