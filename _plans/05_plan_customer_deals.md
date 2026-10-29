# Plan 05: Customer Deals

- **Spec:** [`_specs/05_spec_customer_deals.md`](../_specs/05_spec_customer_deals.md) (approved 2026-10-29)
- **Status:** Ready for implementation
- **Branch:** `feature/05-customer-deals`

## Step 0: Prepare

- Finish spec 04 first: the user runs the `003_export_log` migration and tries the export in the browser; then push `feature/04-export-excel`, open its PR and merge it.
- Commit this spec and plan on `main` (they are currently uncommitted files on the spec 04 branch; move them over with the checkout), push, and create `feature/05-customer-deals` from `main`. The working tree must be clean before implementation starts.
- No new dependencies and no migration: the `deal` table already exists.

## Step 1: Date values (`src/db.js`)

- `pg.types.setTypeParser(1082, (value) => value)` so `DATE` columns come back as `"YYYY-MM-DD"` strings, not a `Date` at server-local midnight (spec 4.1). `deal.expected_close_date` is the only `DATE` column the app reads, so nothing else changes.
- `NUMERIC` already comes back as a string (`"150000.00"`); keep that.

## Step 2: Data access (`src/deals.js`, new)

Every function takes `userId` first and filters on `deal.sales_user_id` (header comment as in `customers.js`).

- `COLUMNS`: `d.deal_id, d.customer_id, c.name AS customer_name, d.title, d.amount, d.stage, d.expected_close_date, d.created_at, d.updated_at`, always selected `FROM deal d JOIN customer c USING (customer_id)`.
- `STAGES = ["lead", "qualified", "proposal", "won", "lost"]`, `OPEN_STAGES = ["lead", "qualified", "proposal"]`, exported for validation and the agent.
- `listDeals(userId, { stage, customerId, q })`:
  - `stage`: a stage, `open` (`= ANY(OPEN_STAGES)`) or `closed`;
  - `q`: escaped `ILIKE` on the title (reuse `search()` from `exportFilters.js`);
  - `ORDER BY d.expected_close_date NULLS LAST, d.deal_id`.
- `dealSummary(userId, filters, tz)`: one query with `FILTER` aggregates:
  - per stage `COUNT(*)` and `COALESCE(SUM(amount), 0)`;
  - open pipeline count and total;
  - won this month: `stage = 'won' AND date_trunc('month', updated_at AT TIME ZONE $tz) = date_trunc('month', now() AT TIME ZONE $tz)`.
  - Sums are cast to `numeric(16,2)::text` so they stay two-decimal strings.
- `getDeal(userId, id)` → deal or `null`.
- `listCustomerDeals(userId, customerId)` → array, or `null` when the customer isn't the user's (checked with `customers.getCustomerById`).
- `createDeal(userId, { customerId, title, amount, stage, expectedCloseDate })`: one statement that inserts only if the customer is the user's:
  `INSERT INTO deal (...) SELECT $customerId, $userId, ... WHERE EXISTS (SELECT 1 FROM customer WHERE customer_id = $customerId AND sales_user_id = $userId) RETURNING deal_id`, then `getDeal`. Returns `null` if the customer isn't the user's.
- `updateDeal(userId, id, fields)`: only `title`, `amount`, `stage`, `expected_close_date` (allow-list as in `updateCustomer`), always `updated_at = now()`, `WHERE deal_id = $1 AND sales_user_id = $2`; then `getDeal`.
- `deleteDeal(userId, id)`: fetches the deal with `getDeal`, deletes it with the same owner filter, and returns it (or `null`).
- The delete-customer warning's deal count comes from the customers list (Step 4), so no separate count function is needed.

## Step 3: Validation (`src/dealValidation.js`, new)

Shared by the routes and the agent tools, so both enforce spec 5.1 the same way:

- `parseAmount(value)`: accepts a number or a numeric string; `^\d{1,12}(\.\d{1,2})?$` after `String(value).trim()`; returns the normalized string or an error.
- `validDate(value)`: reuse the `YYYY-MM-DD` real-date check from `exports.js` (move it to `exportFilters.js` as an export and import it in both).
- `validateDealInput(body, { create })`: returns `{ fields }` or `{ error }`. Title trimmed 1–200, stage in `STAGES`, `expected_close_date` a valid date or `null`, `customer_id` a positive integer on create; `customer_id` and `sales_user_id` are ignored on update.

## Step 4: Customers list gains deal totals (`src/customers.js`)

- `listCustomers` and `findCustomersByName` add, via a `LEFT JOIN LATERAL` (or grouped subquery) over the customer's open deals:
  `open_deals` (`int`), `open_amount` (`numeric(16,2)::text`, `"0.00"` when none) and `total_deals` (`int`, for the delete warning).
- `getCustomerById` and the write functions keep their current columns (the agent and routes don't need the totals there).
- Update the `Customer` schema in Swagger (Step 7).

## Step 5: Routes

- **`src/routes/deals.js` (new):** `router.use(requireAuth, requireRole("sales"))`.
  - `GET /`: validate `stage` (a stage, `open` or `closed`), `customer_id` (positive int), `q` (≤ 200), `tz` (same check as exports); return `{ deals, summary }`.
  - `GET /:id`, `POST /` (`201`; `404 "Customer not found"` when `createDeal` returns `null`), `PUT /:id`, `DELETE /:id`, with `parseId` as in the customer routes and `404 "Deal not found"`.
- **`src/routes/customers.js`:** `GET /:id/deals` → `listCustomerDeals`, `404 "Customer not found"` on `null`.
- **`src/server.js`:** `app.use("/api/deals", dealRoutes)`.

## Step 6: Agent (`src/agent.js`)

- Tools, built in `buildTools` with the user id from the closure (no user id in any schema), all through `deals.js` and `dealValidation.js`:
  - `get_deals` (`stage?`: a stage, `open` or `closed`; `customer_id?`),
  - `get_customer_deals` (`customer_id`),
  - `add_deal` (`customer_id`, `title`, `amount` number, `stage?`, `expected_close_date?` `YYYY-MM-DD`),
  - `update_deal` (`deal_id`, optional fields),
  - `delete_deal` (`deal_id`).
- Validation errors and "not found" are returned to the model as JSON errors, like the customer tools.
- System prompt: deals are sales opportunities for a customer; stages in order; amounts are Indian rupees; look up the customer (by name) before adding a deal; today's date so "30 Nov" resolves to the right year.
- **`frontend/src/components/ChatWidget.jsx`:** add `add_deal`, `update_deal`, `delete_deal` to `MUTATING_TOOLS`.

## Step 7: Export category (`src/exports.js`)

- Add `countDealsForExport` / `listDealsForExport(userId, { from, to, tz })` to `deals.js` (owner filter, `dateRange("d.created_at", ...)`, sorted by `deal_id`).
- Registry entry `deals`: name `Deals`, fileName `Deals`, role `sales`, filters `["from", "to"]`, columns as in spec 7.4:
  - add a `dateOnly` column type: written as a UTC-midnight `Date` from the `"YYYY-MM-DD"` string (no time-zone shift), format `yyyy-mm-dd`;
  - Amount as number with `numFmt` `"₹"#,##,##0.00`;
  - Stage capitalized (a `format` function on the column).
- Customers stay first in the registry, so Export All gives `Customers`, then `Deals`.

## Step 8: Swagger (`src/swagger.js`)

- **Deals** tag; `Deal`, `DealInput`, `DealUpdate`, `DealSummary`, `DealListResponse` schemas with the Sunrise Hospital example.
- The six paths (incl. `/api/customers/{id}/deals`), `bearerAuth`, `400`/`401`/`403`/`404`.
- `Customer` gains `open_deals`, `open_amount`, `total_deals` (read-only).
- Export docs mention `deals`. Version `2.4.0`.

## Step 9: Frontend

- **`api.js`:** `listDeals(params)` (adds `tz`), `getCustomerDeals(id)`, `createDeal`, `updateDeal`, `deleteDeal`.
- **`src/money.js` (new):** `formatINR(amount)` with `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`, dropping `.00`; and `isOverdue(deal)` (open stage and close date before today's local date).
- **`components/StageBadge.jsx`** and **`components/StageSelect.jsx` (new):** the stage label/colour and a compact select in pipeline order.
- **`components/DealForm.jsx` (new):** `Modal` with customer picker (add) or read-only customer (edit), title, amount, stage, expected close date; client validation as in spec 5.1; `onSubmit(data)`.
- **`components/CustomerDealsDialog.jsx` (new):** loads `getCustomerDeals`, lists the deals (title, amount, stage select, close date, Overdue), **Add deal**, edit and delete; calls `onChanged` after any change so the customers table refreshes its totals.
- **`components/DealsView.jsx` (new):** summary tiles, filters (stage, customer, title search), table with inline `StageSelect`, edit/delete, **Add deal**, and an `ExportButton` for `deals` when `canExport('deals')`; reloads on `refreshKey`.
- **`CustomersView.jsx`:** Deals column (`open_deals` · `formatINR(open_amount)` or "—"), a Deals row action opening `CustomerDealsDialog`, and the delete confirmation adds "This also deletes N deals" from `total_deals`.
- **`App.jsx`:** `view` state from `location.hash` (`#deals` → deals, otherwise customers), updated on `hashchange`; the header **Customers** and **Deals** links set the hash; main renders `DealsView` or `CustomersView` for sales users; `DealsView` keyed by user and given `refreshKey`, `notify`, `canExport`.
- **`index.css`:** stage badge colours (light and dark), the Overdue badge, the deals filters row, and the inline stage select.

## Step 10: Docs

- **README:** deals overview, the endpoints, stages, amount and date formats, the assistant's deal tools, the Deals export sheet.
- **CLAUDE.md:** `src/deals.js` follows the per-user rule (owner filter on `deal.sales_user_id`, create only for an owned customer, `customer_id` fixed); `dealValidation.js` is shared by routes and agent; `DATE` values are strings (`db.js` type parser) and amounts are strings; the deal tools are in `MUTATING_TOOLS`; the Deals export category.

## Step 11: Verification

Against the shared database, on a local server, with two temporary sales users (A and B) and one customer each. Criterion numbers refer to spec section 10.

1. With `curl`: criteria 1–14 (CRUD, `400` cases, the date round-trip, cascade on customer delete, `404` across users, `403` for admin, ignored `sales_user_id`, list filters and sort, summary vs direct SQL, customer totals).
2. Assistant (criteria 19–20): two chat requests as user A through `POST /api/agent/chat`; check the created deal in the database and that a request about user B's deal finds nothing.
3. Export (criterion 21): download Export All as user A and inspect the `Deals` sheet with the scratchpad `exceljs` reader (types, the rupee format, the date-only column).
4. Frontend: `npm run lint` and `npm run build`; the user walks through criteria 15–18 in the browser.
5. Delete the temporary users, their customers (deals cascade), and their `export_log` rows.

## Step 12: Finish

- Commit in steps on the branch, push, open a PR to `main` with `gh` (or the user pushes if `gh` is gone).
- After merge, mark the spec and plan done.
