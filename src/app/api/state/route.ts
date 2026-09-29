import { getDeps } from "@/server/deps";
import { respond } from "@/server/http";
import { loadState, parseActor } from "@/server/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return respond(async () => {
    const actor = parseActor(new URL(request.url).searchParams.get("actor"));
    return loadState(getDeps(), actor);
  });
}
