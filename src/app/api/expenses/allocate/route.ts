import { getDeps } from "@/server/deps";
import { readJson, respond, text } from "@/server/http";
import { allocateExpense, parseActor } from "@/server/service";

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    return allocateExpense(
      getDeps(),
      parseActor(body["actor"]),
      text(body["ref"]),
      text(body["allocation"]),
    );
  });
}
