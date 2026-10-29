import { validDate } from "./exportFilters.js";

export const STAGES = ["lead", "qualified", "proposal", "won", "lost"];
export const OPEN_STAGES = ["lead", "qualified", "proposal"];
const MAX_TITLE = 200;
// NUMERIC(14,2): at most 12 digits before the point and 2 after
const AMOUNT_RE = /^\d{1,12}(\.\d{1,2})?$/;

// A number or numeric string → "1234.50"; null if invalid. Never goes through a float for strings.
export function parseAmount(value) {
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim();
  if (!AMOUNT_RE.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
}

// Shared by the REST routes and the agent tools. Returns { fields } or { error }.
// customer_id is only read on create; sales_user_id is never read (the owner is always the caller).
export function validateDealInput(body, { create }) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Request body must be a JSON object" };
  const fields = {};

  if (create) {
    const id = body.customer_id;
    if (!Number.isInteger(id) || id <= 0) return { error: "customer_id must be a positive integer" };
    fields.customerId = id;
  }

  if (create || body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) return { error: "title is required" };
    if (body.title.trim().length > MAX_TITLE) return { error: `title must be at most ${MAX_TITLE} characters` };
    fields.title = body.title.trim();
  }

  if (create || body.amount !== undefined) {
    const amount = parseAmount(body.amount);
    if (amount === null) return { error: "amount must be a number of at least 0, with at most 2 decimals and 12 digits before the point" };
    fields.amount = amount;
  }

  if (body.stage !== undefined) {
    if (!STAGES.includes(body.stage)) return { error: `stage must be one of ${STAGES.join(", ")}` };
    fields.stage = body.stage;
  }

  if (body.expected_close_date !== undefined) {
    const date = body.expected_close_date;
    if (date !== null && !validDate(date)) return { error: "expected_close_date must be a date in YYYY-MM-DD format, or null" };
    fields.expectedCloseDate = date;
  }

  if (!create && Object.keys(fields).length === 0) {
    return { error: "Provide at least one of title, amount, stage, expected_close_date" };
  }
  return { fields };
}
