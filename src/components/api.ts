import type { EmployeeId } from "@/domain/types";
import type { StateView } from "@/server/service";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly details: string[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    (T & { error?: string; details?: string[] }) | null;
  if (!response.ok || body === null) {
    throw new ApiError(
      body?.error ?? `Request failed with status ${response.status}`,
      body?.details ?? [],
    );
  }
  return body;
}

export async function fetchState(actor: EmployeeId): Promise<StateView> {
  const response = await fetch(`/api/state?actor=${encodeURIComponent(actor)}`, {
    cache: "no-store",
  });
  return parse<StateView>(response);
}

export async function post<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  method: "POST" | "DELETE" = "POST",
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parse<T>(response);
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return [error.message, ...error.details].join(" ");
  }
  return error instanceof Error ? error.message : String(error);
}
