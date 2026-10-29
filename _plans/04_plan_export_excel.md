# Plan 04: Export Data to Excel by Category

- **Spec:** [`_specs/04_spec_export_excel.md`](../_specs/04_spec_export_excel.md) (approved 2026-10-29)
- **Status:** Done. Merged to `main` in PR #3
- **Branch:** `feature/04-export-excel`

## Step 0: Prepare

- Commit the spec and this plan on `main`, push, then create `feature/04-export-excel`. The working tree must be clean before implementation starts.
- `cd backend && npm install exceljs@4.4.0 --save-exact`.

## Step 1: Migration

`backend/sql/003_export_log.sql` (idempotent, in a transaction):

- `CREATE TABLE IF NOT EXISTS export_log (...)` as in spec 4.1.
- `CREATE INDEX IF NOT EXISTS export_log_user_created_idx ON export_log (user_id, created_at);`

Ask the user to run `npm run migrate`.

## Step 2: Data access for exports

Both functions take the filters `{ q, from, to, tz }` and push them into SQL. Date bounds are converted in the user's time zone:
`created_at >= ($from::date)::timestamp AT TIME ZONE $tz` and `created_at < ($to::date + 1)::timestamp AT TIME ZONE $tz`.

- **`src/customers.js`**, keeping the "`userId` first, filter on `sales_user_id`" rule:
  - `countCustomersForExport(userId, filters)` and `listCustomersForExport(userId, filters)`, sorted by `customer_id`.
  - `q` matches the customers screen: `name ILIKE $q OR email ILIKE $q OR phone ILIKE $q OR customer_id::text ILIKE $q`, with `%` `_` `\` in the search text escaped so they match literally.
- **`src/admin.js`:** `countSalesUsersForExport(filters)` and `listSalesUsersForExport(filters)`, reusing the spec 03 query (sales users only, `customer_count` via `LEFT JOIN`) plus the date filter on `u.created_at`. Same "admin only" comment.

## Step 3: Export module (`src/exports.js`, new)

- `MAX_EXPORT_ROWS = 100_000`.
- **Category registry** (array, in sheet order). Each entry has:
  - `key`, `name` (sheet name), `fileName` (`Customers`, `SalesUsers`), `role`, `filters` (`["q", "from", "to"]` or `["from", "to"]`);
  - `columns`: `{ header, key, type: "number" | "text" | "date", numFmt }` as in spec 5.1;
  - `count(user, filters)` and `rows(user, filters)`, calling the Step 2 functions with `user.user_id` where needed.
- `categoriesFor(role)` returns the entries for a role.
- `parseExportRequest(query, role)`: validates and returns `{ categories, filters }` or `{ status, error }`:
  - `categories`: comma-separated keys or `all`; unknown key → `400`; a key the role can't export → `403`; empty → `400`.
  - `from` / `to`: `YYYY-MM-DD` and a real date, `from <= to`, else `400`.
  - `q`: string, at most 200 characters; ignored for categories that don't take it.
  - `tz`: accepted if `Intl.DateTimeFormat` accepts it, otherwise `UTC`.
- `zonedDate(date, tz)`: returns a `Date` whose UTC fields equal the wall-clock time in `tz` (via `Intl.DateTimeFormat#formatToParts`), so Excel shows local time.
- `exportFileName(categories, role, tz, now)`: spec 5.6 (`All` when the request covers every category of the role).
- `columnWidths(columns, rows)`: longest formatted value or header, clamped to 8–60.
- `writeWorkbook(stream, sheets)`: an `ExcelJS.stream.xlsx.WorkbookWriter` with `useStyles: true`. For each sheet:
  - `views: [{ state: "frozen", ySplit: 1 }]`, columns with widths and `numFmt`, bold header row;
  - each row added and committed; numbers written as numbers, text as strings (phone forced to string), dates through `zonedDate`; `null` → empty cell;
  - `worksheet.commit()`, then `workbook.commit()`.

## Step 4: Export log (`src/exportLog.js`, new)

`logExport({ user, categories, filters, recordCount, status })` inserts into `export_log`. It catches its own errors and writes them to `console.error`, so logging never breaks a download.

## Step 5: Routes (`src/routes/export.js`, new)

`router.use(requireAuth)`.

- `GET /categories`: `categoriesFor(req.user.role)` mapped to `{ key, name, filters }`.
- `GET /`:
  1. `parseExportRequest`; return its `400` or `403`.
  2. Count every category; if the total is above `MAX_EXPORT_ROWS`, log `rejected` and return `413` with the spec's message.
  3. Fetch all rows (before any byte is sent, so errors can still become JSON).
  4. Set `Content-Type`, `Content-Disposition` (`attachment; filename="…"`) and `X-Export-Rows`, then `writeWorkbook(res, sheets)`.
  5. Log `success` after the workbook commits. If writing fails midway, log `failed` and destroy the response; headers are already sent, so it can't become JSON.
- **`src/server.js`:**
  - `app.use("/api/export", exportRoutes)`.
  - Add `exposedHeaders: ["Content-Disposition", "X-Export-Rows"]` to the `cors()` options.

## Step 6: Swagger (`src/swagger.js`)

- An **Export** tag, an `ExportCategory` schema, and both paths with `bearerAuth`.
- Query parameters `categories` (with an `all` example), `q`, `from`, `to` (format `date`) and `tz`.
- `200` for `/api/export` as `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` with `type: string, format: binary`, plus the `X-Export-Rows` header. `400`, `401`, `403` and `413` responses.
- Bump the version to `2.3.0`, and add an export note to `info.description`.

## Step 7: Frontend

- **`api.js`:**
  - `exportCategories()`.
  - `download(path)`: like `request()` (bearer token, `401` handling, JSON errors → `Error(data.error)`), but on success returns `{ blob, fileName, rows }`, taking the file name from `Content-Disposition` and the row count from `X-Export-Rows`.
  - `exportData({ categories, q, from, to })`: builds the query string and always adds `tz` from `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- **`src/download.js` (new):** `saveBlob(blob, fileName)` with an object URL and a temporary `<a download>`, then revokes the URL.
- **`components/ExportButton.jsx` (new):**
  - Props `categories`, `filters`, `notify`, `label`.
  - Shows a spinner and "Preparing export…" while busy, and is disabled then.
  - On success it saves the file and shows the toast "Exported N rows to <file>"; on error it shows an error toast.
- **`components/ExportDialog.jsx` (new):**
  - Uses `Modal`: one checkbox per exportable category (all checked), optional From/To `type="date"` inputs.
  - Validates from ≤ to and at least one category, then exports `all` when every box is checked, otherwise the checked keys.
  - Same busy, toast and error behavior as `ExportButton`; closes on success.
- **`App.jsx`:**
  - After sign-in (and for a restored session), load `api.exportCategories()` into state, keyed by user; reset on logout.
  - Add an **Export** header button when the list isn't empty; it opens `ExportDialog`.
  - Pass `canExport` and `notify` to `CustomersView` and `AdminDashboard`.
- **`CustomersView.jsx`:** an `ExportButton` (category `customers`, `{ q: query }`) in the toolbar after **Refresh**, shown when `canExport`.
- **`AdminDashboard.jsx`:** an `ExportButton` (category `sales_users`) after **Refresh**, shown when `canExport`. It also needs `notify` passed in.
- **`Icons.jsx`:** add a `DownloadIcon`.
- **`index.css`:** styles for the dialog's checkbox list and the date row, reusing the `.field` styles.

## Step 8: Docs

- **README:** the export endpoints, categories per role, the filters, the 100,000-row limit, the `export_log` table, and migration `003`.
- **CLAUDE.md:**
  - `src/exports.js` is the category registry. A new category is one entry, and its data function must follow the per-user rule, or the admin-only rule for cross-user data.
  - Exports must only include data the role can already view.
  - `export_log` and migration `003`.
  - `api.download` is for file responses, and CORS exposes `Content-Disposition` and `X-Export-Rows`.

## Step 9: Verification

Against the shared database, on a local server. Criterion numbers refer to spec section 10.

1. After the user runs the migration, use a temporary sales test user with a few customers (including a phone with a leading zero and one created on a known date).
2. With `curl`, download the exports and inspect each file with a small `exceljs` reader script in the scratchpad. Check:
   - sheet names and order, headers and the bold header row, the frozen view and column widths (criteria 1–3, 6–7);
   - cell types (number, date, string) and formats, and the leading zero (criterion 4);
   - the empty-sheet case (criterion 5);
   - row counts against direct `COUNT(*)` queries and against the screen's search logic, for `q` and date ranges (criteria 8–9).
3. Criteria 10–13: `401` and `403` cases, the categories endpoint, and `export_log` rows read back from the database.
4. Criterion 14: lower `MAX_EXPORT_ROWS` to 1 locally, check the `413` and the `rejected` log row, then restore the constant (not committed).
5. Criteria 15–16: frontend `npm run lint` and `npm run build`; then the user tries the buttons and dialog in the browser, checking the toasts and the file name.
6. Criterion 17: the user opens a file in Excel or Google Sheets. Criterion 18: Swagger.
7. Delete the test user, its customers, and its `export_log` rows (their `user_id` becomes `NULL` on delete, so remove them by `user_email`).

## Step 10: Finish

- Commit in steps on the branch, push, and open a PR to `main` with `gh`. The GitHub CLI downloaded in this session is temporary; if it's gone, the user pushes, or installs `gh` (the login is already in the keychain).
- After merge, mark the spec and plan done.
