import ExcelJS from "exceljs";
import { countCustomersForExport, listCustomersForExport } from "./customers.js";
import { countSalesUsersForExport, listSalesUsersForExport } from "./admin.js";

export const MAX_EXPORT_ROWS = 100_000;
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const DATE_FORMAT = "yyyy-mm-dd hh:mm";
const MAX_Q = 200;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Exportable categories, in sheet order. A role may export exactly the categories it can view;
// each category's data functions apply the same access rules as the screens.
const CATEGORIES = [
  {
    key: "customers",
    name: "Customers",
    fileName: "Customers",
    role: "sales",
    filters: ["q", "from", "to"],
    columns: [
      { header: "Customer ID", key: "customer_id", type: "number", numFmt: "0" },
      { header: "Name", key: "name", type: "text" },
      { header: "Email", key: "email", type: "text" },
      { header: "Phone", key: "phone", type: "text" },
      { header: "Created", key: "created_at", type: "date" },
    ],
    count: (user, filters) => countCustomersForExport(user.user_id, filters),
    rows: (user, filters) => listCustomersForExport(user.user_id, filters),
  },
  {
    key: "sales_users",
    name: "Sales users",
    fileName: "SalesUsers",
    role: "admin",
    filters: ["from", "to"],
    columns: [
      { header: "User ID", key: "user_id", type: "number", numFmt: "0" },
      { header: "Name", key: "name", type: "text" },
      { header: "Email", key: "email", type: "text" },
      { header: "Joined", key: "created_at", type: "date" },
      { header: "Customers", key: "customer_count", type: "number", numFmt: "#,##0" },
    ],
    count: (user, filters) => countSalesUsersForExport(filters),
    rows: (user, filters) => listSalesUsersForExport(filters),
  },
];

export const categoriesFor = (role) => CATEGORIES.filter((c) => c.role === role);

function validTimeZone(tz) {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// A real calendar date in YYYY-MM-DD (rejects 2026-02-30)
function validDate(value) {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Returns { categories, all, filters } or { status, error }; all is true for categories=all
export function parseExportRequest(query, role) {
  const raw = typeof query.categories === "string" ? query.categories.trim() : "";
  if (!raw) return { status: 400, error: "categories is required (comma-separated keys, or all)" };
  const allowed = categoriesFor(role);
  let categories;
  if (raw === "all") {
    categories = allowed;
  } else {
    const keys = new Set(raw.split(",").map((k) => k.trim()).filter(Boolean));
    for (const key of keys) {
      if (!CATEGORIES.some((c) => c.key === key)) return { status: 400, error: `Unknown category: ${key}` };
      if (!allowed.some((c) => c.key === key)) return { status: 403, error: `You are not allowed to export ${key}` };
    }
    categories = allowed.filter((c) => keys.has(c.key));
  }
  if (categories.length === 0) return { status: 403, error: "You have no categories to export" };

  const { q, from, to } = query;
  if (q !== undefined && (typeof q !== "string" || q.length > MAX_Q)) return { status: 400, error: `q must be at most ${MAX_Q} characters` };
  for (const [name, value] of [["from", from], ["to", to]]) {
    if (value !== undefined && value !== "" && (typeof value !== "string" || !validDate(value))) {
      return { status: 400, error: `${name} must be a date in YYYY-MM-DD format` };
    }
  }
  if (from && to && from > to) return { status: 400, error: "from must be on or before to" };

  const filters = {
    q: q?.trim() || undefined,
    from: from || undefined,
    to: to || undefined,
    tz: validTimeZone(query.tz) ? query.tz : "UTC",
  };
  return { categories, all: raw === "all", filters };
}

// The wall-clock fields of `date` in `tz`, as numbers
function zonedParts(date, tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
}

// Excel dates have no time zone: write a Date whose UTC fields are the user's local wall-clock time
export function zonedDate(date, tz) {
  const p = zonedParts(date, tz);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
}

const pad = (n) => String(n).padStart(2, "0");

// CustomerHub_<Category or All>_<YYYY-MM-DD_HHmm>.xlsx, in the user's time zone.
// "All" only for an Export All request, so a single-category export is named after its category.
export function exportFileName(categories, all, tz, now = new Date()) {
  const label = all ? "All" : categories.map((c) => c.fileName).join("-");
  const p = zonedParts(now, tz);
  return `CustomerHub_${label}_${p.year}-${pad(p.month)}-${pad(p.day)}_${pad(p.hour)}${pad(p.minute)}.xlsx`;
}

function cellValue(column, value, tz) {
  if (value === null || value === undefined) return null;
  if (column.type === "number") return Number(value);
  if (column.type === "date") return zonedDate(new Date(value), tz);
  return String(value); // text stays text, so phone numbers keep leading zeros
}

const displayLength = (column, value) => (column.type === "date" ? DATE_FORMAT.length : String(value ?? "").length);

// Longest value or header in each column, between 8 and 60 characters
export function columnWidths(columns, rows) {
  return columns.map((column) => {
    const longest = rows.reduce((max, row) => Math.max(max, displayLength(column, row[column.key])), column.header.length);
    return Math.min(60, Math.max(8, longest + 2));
  });
}

// sheets: [{ category, rows }]. Streams the workbook into `stream` and resolves when it is complete.
export async function writeWorkbook(stream, sheets, tz) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true, useSharedStrings: false });
  workbook.creator = "Customer Hub";
  for (const { category, rows } of sheets) {
    const sheet = workbook.addWorksheet(category.name, { views: [{ state: "frozen", ySplit: 1 }] });
    const widths = columnWidths(category.columns, rows);
    sheet.columns = category.columns.map((c, i) => ({
      header: c.header,
      key: c.key,
      width: widths[i],
      style: c.type === "date" ? { numFmt: DATE_FORMAT } : c.numFmt ? { numFmt: c.numFmt } : {},
    }));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).commit();
    for (const row of rows) {
      sheet.addRow(Object.fromEntries(category.columns.map((c) => [c.key, cellValue(c, row[c.key], tz)]))).commit();
    }
    sheet.commit();
  }
  await workbook.commit();
}
