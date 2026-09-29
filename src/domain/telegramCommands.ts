import type { RawExpense, RawSale } from "@/domain/validation";

export type BotCommand =
  | { kind: "start" }
  | { kind: "help" }
  | { kind: "my" }
  | { kind: "sale"; raw: RawSale }
  | { kind: "expense"; raw: RawExpense }
  | { kind: "invalid"; message: string }
  | { kind: "unknown" };

export const SALE_USAGE =
  "/sale REF | Customer | Project A or B | Description | Amount | Richard/Anastasia/Jean-Claude %\n" +
  "Example:\n/sale S01 | Olivia Rose | A | One proud uncle and an emotional grandmother | 1000 | 50/30/20";

export const EXPENSE_USAGE =
  "/expense REF | Description | Category (Materials, Travel, Other) | Amount | Allocation (A, B, Overhead)\n" +
  "Example:\n/expense E01 | Rented suit and fake pearl necklace | Materials | 120 | A";

function splitFields(text: string): string[] {
  return text.split("|").map((field) => field.trim());
}

function parseSale(args: string): BotCommand {
  const fields = splitFields(args);
  if (fields.length !== 6) {
    return {
      kind: "invalid",
      message: `A sale needs 6 fields separated by |, got ${fields.length}.\n\n${SALE_USAGE}`,
    };
  }
  const [ref, customer, project, description, amount, splitRaw] = fields as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const shares = splitRaw.split("/").map((s) => s.trim());
  if (shares.length !== 3) {
    return {
      kind: "invalid",
      message: `The split needs three percentages like 50/30/20 (Richard/Anastasia/Jean-Claude).\n\n${SALE_USAGE}`,
    };
  }
  const [richard, anastasia, jeanClaude] = shares as [string, string, string];
  return {
    kind: "sale",
    raw: {
      ref,
      customer,
      project,
      description,
      amount,
      split: { richard, anastasia, "jean-claude": jeanClaude },
    },
  };
}

function parseExpense(args: string): BotCommand {
  const fields = splitFields(args);
  if (fields.length !== 5) {
    return {
      kind: "invalid",
      message: `An expense needs 5 fields separated by |, got ${fields.length}.\n\n${EXPENSE_USAGE}`,
    };
  }
  const [ref, description, category, amount, allocation] = fields as [
    string,
    string,
    string,
    string,
    string,
  ];
  return { kind: "expense", raw: { ref, description, category, amount, allocation } };
}

/** Parses bot message text. Accepts "/cmd@BotName" and multi-line arguments. */
export function parseBotCommand(text: string): BotCommand {
  const match = /^\/([a-z]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!match) {
    return { kind: "unknown" };
  }
  const command = (match[1] ?? "").toLowerCase();
  const args = (match[2] ?? "").trim();
  switch (command) {
    case "start":
      return { kind: "start" };
    case "help":
      return { kind: "help" };
    case "my":
      return { kind: "my" };
    case "sale":
      return parseSale(args);
    case "expense":
      return parseExpense(args);
    default:
      return { kind: "unknown" };
  }
}
