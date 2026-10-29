# Spec 04: Export Data to Excel by Category

- **Status:** Approved (2026-10-29)
- **Date:** 2026-10-29
- **Depends on:** Spec 01 (per-user customer access), Spec 03 (admin role and sales users dashboard)
- **Affects:** `backend/` (new export API, export log table, Swagger, one new dependency) and `frontend/`

## 1. Background

Users can see their data in the app but can't take it out of it. Sales users want their customer list in Excel, and the admin wants the sales team overview as a spreadsheet.

The request is written for a generic system with categories A, B and C. This spec maps it onto what Customer Hub actually holds today:

| Category | Who can export it | Contents (same as what that user can view) |
|---|---|---|
| **Customers** | Sales users | The signed-in sales user's own customers (spec 01 rule) |
| **Sales users** | Admins | Every sales user with their customer count (the spec 03 dashboard) |

Each role therefore has **one** category today, so **Export All** produces a one-sheet workbook until more categories exist (for example when the `deal` table is used, or if open question 1 is accepted). The design is a category registry, so adding a category later means adding one entry, not changing the export flow.

## 2. Goals

1. A user can export the categories they are allowed to view to a single `.xlsx` workbook, one worksheet per category, either one category at a time or all of them at once.
2. Sheets have clear headers, correct data types, consistent date and number formats, a frozen header row and fitted column widths.
3. An export reflects the filters active on the screen it was started from, plus an optional date range.
4. Users only export data they can already view; every export is logged.
5. Exports of up to **100,000 rows** finish without timing out.
6. The UI shows progress while the file is prepared and a success or error message at the end.
7. The endpoints are documented in Swagger and can be tested there.

## 3. Non-goals

- **Background export jobs** with "your file is ready" notifications. The backend runs as Vercel serverless functions with no job queue or file storage, and current data is small (15 customers). Exports are generated synchronously and streamed; see 5.5 for the size limit and open question 4 for the background-job option.
- Other formats (CSV, PDF), scheduled or emailed exports, and importing from Excel.
- An export tool for the AI agent.
- A screen to browse the export log (it can be queried in the database; a possible later spec).
- Exporting the `deal` table, which the app does not use yet.

## 4. Data model (migration `sql/003_export_log.sql`, idempotent)

### 4.1 New table `export_log`

| Column | Type | Rules |
|---|---|---|
| `export_id` | `SERIAL PRIMARY KEY` | |
| `user_id` | `INTEGER REFERENCES app_user(user_id) ON DELETE SET NULL` | Kept (as `NULL`) if the user is deleted, so the audit trail survives |
| `user_email` | `TEXT NOT NULL` | Copied at export time, for the same reason |
| `categories` | `TEXT[] NOT NULL` | Category keys, e.g. `{customers}` |
| `filters` | `JSONB NOT NULL DEFAULT '{}'` | The filters that were applied |
| `record_count` | `INTEGER NOT NULL` | Total data rows across all sheets |
| `status` | `TEXT NOT NULL CHECK (status IN ('success', 'failed', 'rejected'))` | `rejected` = refused for size (413) |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |

Index on `(user_id, created_at)`.

The user runs `npm run migrate` (blocked for Claude on the shared database).

## 5. Behavior

### 5.1 Categories and columns

**Customers** (sheet name `Customers`), sorted by `customer_id`:

| Column header | Source | Excel type and format |
|---|---|---|
| Customer ID | `customer_id` | Number, `0` |
| Name | `name` | Text |
| Email | `email` | Text (empty cell if null) |
| Phone | `phone` | **Text**, so leading zeros and `+` are kept |
| Created | `created_at` | Date, `yyyy-mm-dd hh:mm` |

**Sales users** (sheet name `Sales users`), sorted by name then `user_id`:

| Column header | Source | Excel type and format |
|---|---|---|
| User ID | `user_id` | Number, `0` |
| Name | `name` | Text |
| Email | `email` | Text |
| Joined | `created_at` | Date, `yyyy-mm-dd hh:mm` |
| Customers | `customer_count` | Number, `#,##0` |

Rules for every sheet:

- Row 1 holds the headers, in bold; the header row is frozen.
- Column widths are fitted to the longest value in the column (header included), between 8 and 60 characters.
- Dates are real Excel dates (not text), converted to the **user's time zone** (sent by the browser as an IANA name such as `Europe/London`; `UTC` if missing or invalid), because Excel dates have no time zone.
- A category with no matching rows still produces its sheet with the header row only.
- Sheet names follow Excel's rules (at most 31 characters, none of `[ ] : * ? / \`). The registry's names already do.
- Sheets appear in registry order (Customers, then Sales users), not in request order.

### 5.2 Filters

| Filter | Applies to | Meaning |
|---|---|---|
| `q` | Customers | The customers screen's search text. Matches exactly like the screen does today: case-insensitive substring of name, email, phone or customer ID. |
| `from`, `to` | Both | Inclusive dates (`YYYY-MM-DD`) on `created_at` (Customers) or `created_at` / joined (Sales users), in the user's time zone. Either may be omitted. |

- The export button on a screen sends that screen's current filters, so the file matches what is on screen.
- `from` after `to` returns `400`.
- Filters are applied in SQL, server-side, using the same per-user data-access rules as the screens (`customers.js` filters on `sales_user_id`; the Sales users query is the admin-only one from spec 03).

### 5.3 Permissions

- **Export permission is role-based:** a role can export exactly the categories it can view (table in section 1). No new per-user flag; see open question 2.
- Not signed in: `401`. Requesting a category the role may not export: `403`, and nothing is exported.
- The UI only shows export controls for categories the user may export, using the list from `GET /api/export/categories`.

### 5.4 Logging

Every export attempt that passes validation and permission checks writes one `export_log` row: user, time, categories, filters, record count and status. A failure while writing the log does not fail the download, but is logged to the server console.

### 5.5 Size and performance

- Rows are fetched per category and written with a **streaming** workbook writer, so memory stays bounded and the response starts quickly.
- **Limit: 100,000 rows per export** in total. Before writing, the server counts matching rows; above the limit it returns `413` "This export has N rows; the limit is 100,000. Narrow the filters and try again." and logs a `rejected` row.
- Vercel note: serverless responses are limited in size and duration. 100,000 customer rows is about 3 to 4 MB as `.xlsx`, which fits, but the limit is set in one constant (`MAX_EXPORT_ROWS`) so it can be lowered if a deployment hits a platform limit.

### 5.6 File name

`CustomerHub_<Category or "All">_<YYYY-MM-DD_HHmm>.xlsx`, with the time in the user's time zone. Spaces in category names are removed.

- One category: `CustomerHub_Customers_2026-10-29_1432.xlsx`, `CustomerHub_SalesUsers_2026-10-29_1432.xlsx`.
- All of the role's categories: `CustomerHub_All_2026-10-29_1432.xlsx`. (With one category per role today, Export All therefore uses `All`.)
- A subset of two or more: the names joined with `-`.

## 6. API

| Method | Path | Auth | Query | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/export/categories` | Signed in | none | `200 [{ key, name, filters }]` for the user's role | `401` |
| GET | `/api/export` | Signed in | `categories` (comma-separated keys, or `all`), `q`, `from`, `to`, `tz` | `200` `.xlsx` file | `400`, `401`, `403`, `413` |

- `GET /api/export` responds with `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `Content-Disposition: attachment; filename="<name>.xlsx"`, and exposes `Content-Disposition` through CORS so the frontend can read the file name.
- Errors are JSON `{ error }`, like every other endpoint.
- `categories=all` means every category the role may export.
- A `GET` is used so the request is a plain download that is easy to try in Swagger.

## 7. Frontend

- **Customers screen (sales):** an **Export to Excel** button in the toolbar next to **Refresh**. It exports the Customers category with the current search text.
- **Admin dashboard:** an **Export to Excel** button next to **Refresh**, exporting the Sales users category.
- **Global Export All:** an **Export** item in the header (signed-in users only). It opens a dialog (using the existing `Modal`) with:
  - a checkbox per category the user may export, all checked by default ("Export All");
  - optional From and To dates;
  - an **Export** button.
- **Progress and result:**
  - While exporting, the button shows a spinner and "Preparing export…", and is disabled so a second export can't start.
  - When the download finishes, the browser saves the file under the server's file name, and a success toast says "Exported N rows to <file name>" (row count from an `X-Export-Rows` response header).
  - Errors (`400`, `403`, `413`, network) show an error toast with the server's message.
- `api.js` gets a download helper that adds the bearer token, reads the response as a blob, and turns non-2xx JSON responses into errors like the existing `request()`.
- Users without any exportable category see no export controls.

## 8. Swagger

- A new **Export** tag with both endpoints, the query parameters and examples.
- The file response is documented as a binary `.xlsx`, so Swagger UI offers a download link.
- `403` and `413` responses documented. Bump the version to `2.3.0`.

## 9. Configuration and dependencies

- New backend dependency: **`exceljs@4.4.0`** (exact version) (streaming writer, frozen panes, column widths and number formats).
- No new environment variables. `MAX_EXPORT_ROWS` is a constant in the export module.

## 10. Acceptance criteria

### 10.1 Single category

1. A sales user exporting **Customers** gets one workbook with exactly one sheet named `Customers`, containing all of their customers and no one else's (row count matches `SELECT COUNT(*) FROM customer WHERE sales_user_id = <id>`).
2. The admin exporting **Sales users** gets one sheet named `Sales users` whose rows and counts match the dashboard.
3. Row 1 has the headers from 5.1 in bold; the header row stays visible when scrolling; columns are wide enough to read the values.
4. In Excel, IDs and counts are numbers (they sum), `Created` / `Joined` are dates (they sort and filter as dates) shown as `yyyy-mm-dd hh:mm` in the user's time zone, and phone numbers keep leading zeros.
5. A category with no matching rows produces its sheet with only the header row.

### 10.2 Export All

6. **Export All** produces one workbook with one sheet per category the user may export, named after the category, in registry order, and the file name uses `All`.
7. Selecting a subset of categories in the dialog exports only those, one sheet each.

### 10.3 Filters

8. With search text on the customers screen, the export contains exactly the rows shown on screen.
9. With a From/To range, only rows created within the range (inclusive, in the user's time zone) are exported; From after To returns `400`.

### 10.4 Permissions and logging

10. Without a token, both export endpoints return `401`.
11. A sales token requesting `sales_users`, or an admin token requesting `customers`, gets `403` and no file.
12. `GET /api/export/categories` returns only the categories the role may export, and the UI shows export controls only for those.
13. Each successful export adds an `export_log` row with the user, time, categories, filters and correct `record_count`; a refused (`413`) export adds a `rejected` row.

### 10.5 Size, UI and files

14. An export above `MAX_EXPORT_ROWS` returns `413` with a message to narrow the filters (tested by temporarily lowering the constant).
15. While exporting, the button shows a spinner and is disabled; on success a toast shows the row count and file name; on error a toast shows the server message.
16. The file name follows `CustomerHub_<Category or All>_<YYYY-MM-DD_HHmm>.xlsx` in the user's local time.
17. The file opens without warnings in Excel and in LibreOffice or Google Sheets.
18. Both endpoints can be tested in Swagger (the export downloads a file). Frontend lint and build pass.

## 11. Decisions

The user approved the spec with the recommended answers:

1. **Should the admin also be able to export all customers (with their owner)?** This would give admins a second category, so Export All would produce two sheets, but it lets admins see individual customers, which spec 03 left out. **No** for now, so "export only what you can view" stays true; add it in a later spec together with an admin customers screen if wanted.
2. **Export permission:** role-based (every sales user and admin can export what they can view), or a new per-user `can_export` flag set in the database? **Role-based**, since there is no permissions UI and every user can already see this data on screen.
3. **Row limit:** 100,000 rows per export, as in the request. **Kept.**
4. **Background exports:** **not now** (section 3). If wanted later, it needs a job table, a worker outside Vercel's request limits, and file storage (for example S3 or Vercel Blob) for the finished file.
5. **Migration:** the user runs `npm run migrate` for `003_export_log.sql`.
