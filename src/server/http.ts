import { NextResponse } from "next/server";
import type { RawExpense, RawSale, RawSplit } from "@/domain/validation";
import { ServiceError } from "@/server/service";

type JsonObject = Record<string, unknown>;

export function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function object(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

export function rawSplit(value: unknown): RawSplit {
  const split = object(value);
  return {
    richard: text(split["richard"]),
    anastasia: text(split["anastasia"]),
    "jean-claude": text(split["jean-claude"]),
  };
}

export function rawSale(value: unknown): RawSale {
  const sale = object(value);
  return {
    ref: text(sale["ref"]),
    customer: text(sale["customer"]),
    project: text(sale["project"]),
    description: text(sale["description"]),
    amount: text(sale["amount"]),
    split: rawSplit(sale["split"]),
  };
}

export function rawExpense(value: unknown): RawExpense {
  const expense = object(value);
  return {
    ref: text(expense["ref"]),
    description: text(expense["description"]),
    category: text(expense["category"]),
    amount: text(expense["amount"]),
    allocation: text(expense["allocation"]),
  };
}

export async function readJson(request: Request): Promise<JsonObject> {
  try {
    return object(await request.json());
  } catch {
    throw new ServiceError(400, "Request body must be JSON.");
  }
}

/** Runs a handler and maps refusals to their HTTP status with a readable message. */
export async function respond(handler: () => Promise<unknown>): Promise<NextResponse> {
  try {
    return NextResponse.json(await handler());
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Server error: ${message}`, details: [] }, { status: 500 });
  }
}
