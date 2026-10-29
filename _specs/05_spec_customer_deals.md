# Spec 05: Customer Deals

- **Status:** Done. Implemented and merged to `main` in PR #4 (2026-10-29)
- **Date:** 2026-10-29
- **Depends on:** Spec 01 (per-user customer access), Spec 03 (roles), Spec 04 (export category registry, for 7.4)
- **Affects:** `backend/` (deals data access, REST API, agent tools, export, Swagger) and `frontend/`

## 1. Background

A **deal** is one sales opportunity with a customer. For example:

> Sunrise Hospital wants 5,000 printed brochures. Priya creates a deal:
> **Title** "Brochure printing – Q4", **Amount** ₹1,50,000, **Stage** Lead, **Expected close date** 30 Nov.

One customer can have many deals over time: brochures this month, ID cards next month.

The shared database already has a `deal` table (created outside this repo, 4 rows today) that the app doesn't use yet:

| Column | Type | Rules in the database |
|---|---|---|
| `deal_id` | `SERIAL` | Primary key |
| `customer_id` | `INTEGER NOT NULL` | → `customer`, `ON DELETE CASCADE` |
| `sales_user_id` | `INTEGER NOT NULL` | → `app_user` |
| `title` | `TEXT NOT NULL` | |
| `amount` | `NUMERIC(14,2) NOT NULL` | `CHECK (amount >= 0)` |
| `stage` | `TEXT NOT NULL DEFAULT 'lead'` | `CHECK (stage IN ('lead','qualified','proposal','won','lost'))` |
| `expected_close_date` | `DATE` | Nullable |
| `created_at`, `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | No trigger keeps `updated_at` current |

Indexes exist on `customer_id` and `sales_user_id`. In every existing row, the deal's `sales_user_id` equals its customer's `sales_user_id`.

## 2. Goals

1. A sales user can create, view, edit and delete deals for **their own** customers.
2. A deal has a title, an amount in rupees, a stage (Lead → Qualified → Proposal → Won / Lost) and an optional expected close date.
3. A customer can have any number of deals; the customer's deals are visible from the customer.
4. A sales user sees all their deals in one list, filterable by stage, with a pipeline summary.
5. Deals follow the same access rules as customers: another user's deal behaves exactly like a missing one (`404`).
6. The AI assistant can read and manage deals under the same rules.
7. Deals can be exported to Excel (spec 04).
8. The endpoints are documented in Swagger.

## 3. Non-goals

- Admin views of deals (pipeline per sales user on the dashboard). See open question 3.
- Multiple currencies. Every amount is in Indian rupees (₹).
- Deal history (who changed the stage and when), activities, notes, attachments, line items, probabilities or forecasting.
- Moving a deal to another customer or another sales user.
- A Kanban (drag-and-drop) board.

## 4. Data model

**No schema change and no migration.** The app uses the existing `deal` table as is.

Rules the app enforces in addition to the database:

- `deal.sales_user_id` is always the logged-in user; it is never taken from a request.
- A deal can only be created for a customer the user owns, so the deal's owner always equals the customer's owner.
- `customer_id` is fixed when the deal is created and can't be changed.
- Every update sets `updated_at = now()`.
- Deleting a customer deletes its deals (existing `ON DELETE CASCADE`). The UI warns about this (7.1).

### 4.1 Value formats in the API

- **`amount`** is sent and returned as a **string with two decimals** (`"150000.00"`), never a float, so paise are never lost. Input may be a number or a numeric string.
- **`expected_close_date`** is sent and returned as **`"YYYY-MM-DD"`** or `null`. The backend configures `pg` to return `DATE` values as plain strings. Today `pg` turns them into a JavaScript `Date` at server-local midnight, which shifts the day (a 28 Oct date comes back as `2026-10-27T21:00:00Z` on this machine).
- `stage` is one of `lead`, `qualified`, `proposal`, `won`, `lost`.

## 5. Behavior

### 5.1 Validation

| Field | Create | Update | Rules |
|---|---|---|---|
| `customer_id` | Required | Not allowed | A positive integer; must be one of the user's customers, else `404 "Customer not found"` |
| `title` | Required | Optional | Trimmed, 1–200 characters |
| `amount` | Required | Optional | A number ≥ 0 with at most 2 decimals and at most 12 digits before the point (fits `NUMERIC(14,2)`) |
| `stage` | Optional (default `lead`) | Optional | One of the five stages |
| `expected_close_date` | Optional | Optional | A real date `YYYY-MM-DD`, or `null` to clear it |

Unknown fields are ignored. Invalid input returns `400 { error }`.

### 5.2 Stages

- **Open** stages: Lead, Qualified, Proposal. **Closed** stages: Won, Lost.
- Any stage can be set from any other stage, so a mistake can be corrected and a lost deal can be reopened. The normal path is Lead → Qualified → Proposal → Won or Lost, and the UI presents the stages in that order.
- An **open** deal whose expected close date is before today (in the user's time zone) is shown as **Overdue**.

### 5.3 Access control

- Every function in the new `src/deals.js` takes the owner's `userId` first and filters on `deal.sales_user_id`, like `customers.js`.
- Another user's deal, or a deal of another user's customer, returns `404`, the same as a missing one.
- Deal routes are **sales only** (`requireRole("sales")`, like the customer routes); admins get `403`.

### 5.4 Pipeline summary

For the user's deals (respecting the stage and customer filters of the list):

- count and total amount per stage;
- **open pipeline**: count and total of Lead + Qualified + Proposal;
- **won this month**: count and total of Won deals whose `updated_at` falls in the current calendar month, in the user's time zone.

Totals are computed in SQL and returned as two-decimal strings.

## 6. API

All endpoints need a sales token.

| Method | Path | Body / query | Success | Errors |
|---|---|---|---|---|
| GET | `/api/deals` | Query: `stage` (one stage, or `open` / `closed`), `customer_id`, `q` (title contains), `tz` | `200 { deals, summary }` | `400`, `401`, `403` |
| GET | `/api/deals/{id}` | | `200` deal | `401`, `403`, `404` |
| POST | `/api/deals` | `{ customer_id, title, amount, stage?, expected_close_date? }` | `201` deal | `400`, `401`, `403`, `404` (customer) |
| PUT | `/api/deals/{id}` | Any of `{ title, amount, stage, expected_close_date }` | `200` deal | `400`, `401`, `403`, `404` |
| DELETE | `/api/deals/{id}` | | `200` deleted deal | `401`, `403`, `404` |
| GET | `/api/customers/{id}/deals` | | `200` the customer's deals | `401`, `403`, `404` (customer) |

A deal in responses:

```json
{
  "deal_id": 5,
  "customer_id": 12,
  "customer_name": "Sunrise Hospital",
  "title": "Brochure printing – Q4",
  "amount": "150000.00",
  "stage": "lead",
  "expected_close_date": "2026-11-30",
  "created_at": "2026-10-29T08:00:00.000Z",
  "updated_at": "2026-10-29T08:00:00.000Z"
}
```

- `sales_user_id` is not returned (it is always the caller).
- Lists are sorted by expected close date (no date last), then `deal_id`.
- `GET /api/customers` gains two fields per customer: `open_deals` (count) and `open_amount` (string), used by the customers table.

## 7. Frontend

No router library. A **Deals** link in the header switches the main area between Customers and Deals (kept in the URL hash, `#deals`, so a reload stays on the same view). Sales users only.

### 7.1 Customers screen

- New **Deals** column: open deal count and open amount (e.g. "2 · ₹2,40,000"), or "—".
- A **Deals** row action opens the customer's deals in a dialog: their deals (title, amount, stage, close date, Overdue badge), an **Add deal** button, and edit and delete per deal.
- The delete-customer confirmation says "This also deletes N deals" when the customer has deals.

### 7.2 Deals screen

- Summary tiles: **Open pipeline** (amount and count), **Won this month** (amount and count), **Lost** (count).
- Filters: stage (All, Open, Lead, Qualified, Proposal, Won, Lost), customer, and a title search.
- A table: title, customer, amount (right-aligned), stage badge, expected close date (with Overdue), and edit and delete actions.
- **Add deal** opens the deal form with a customer picker.

### 7.3 Deal form

A dialog (existing `Modal`, `CustomerForm` field styles): customer (picker when adding, read-only when editing), title, amount in ₹, stage (select, in pipeline order), expected close date (date input, optional). Client-side validation mirrors 5.1. A stage dropdown is also available directly in the table rows for a quick stage change.

Amounts are shown with Indian digit grouping (`Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`, e.g. ₹1,50,000.00, shown without paise when they are zero).

### 7.4 Export

A new spec 04 export category **Deals** for sales users (sheet `Deals`): Deal ID (number), Customer (text), Title (text), Amount (number, `₹#,##,##0.00`), Stage (text, capitalized), Expected close (date, `yyyy-mm-dd`), Created and Updated (dates). Filters: `from` / `to` on `created_at`. The deals screen gets an **Export to Excel** button, and **Export All** then produces two sheets (Customers and Deals) for sales users.

### 7.5 Assistant

- New agent tools, bound to the logged-in user like the customer tools: `get_deals` (optional stage and customer filters), `get_customer_deals`, `add_deal`, `update_deal`, `delete_deal`. No tool takes a user id.
- `add_deal`, `update_deal` and `delete_deal` are added to `MUTATING_TOOLS` in `ChatWidget.jsx`, so the screens reload after the assistant changes a deal.
- The system prompt mentions deals, the stages and that amounts are in rupees.

## 8. Swagger

A **Deals** tag with the six endpoints, `Deal`, `DealInput`, `DealUpdate` and `DealSummary` schemas, examples using the Sunrise Hospital deal, and `403` for admin tokens. The customers list schema gains `open_deals` and `open_amount`. The export docs list the `deals` category. Bump the version to `2.4.0`.

## 9. Configuration

No new environment variables and no new dependencies.

## 10. Acceptance criteria

### 10.1 Deals CRUD

1. A sales user creates "Brochure printing – Q4" for their customer Sunrise Hospital with amount `150000`, stage omitted and close date `2026-11-30`; the response is `201` with `amount: "150000.00"`, `stage: "lead"` and `expected_close_date: "2026-11-30"`.
2. A second deal ("ID cards") for the same customer is created; `GET /api/customers/{id}/deals` returns both.
3. Updating the stage through Qualified, Proposal and Won works and changes `updated_at` each time; `customer_id` in an update body is ignored.
4. Invalid input returns `400`: missing title, a title over 200 characters, a negative amount, `12.345`, an unknown stage, `2026-02-30`.
5. `expected_close_date: null` clears the date; the date round-trips unchanged (no day shift) in any server time zone.
6. Deleting a deal returns it and removes it; deleting a customer removes its deals.

### 10.2 Access control

7. Creating a deal for another user's customer returns `404 "Customer not found"`.
8. Reading, updating or deleting another user's deal returns `404`, and the deal is unchanged.
9. An admin token gets `403` on every deal endpoint; no token gets `401`.
10. `sales_user_id` in a request body is ignored; the deal always belongs to the caller.

### 10.3 Lists and summary

11. `GET /api/deals` returns only the caller's deals, with `customer_name`, sorted by close date then id.
12. The `stage`, `open`, `closed`, `customer_id` and `q` filters return the right rows.
13. The summary's per-stage counts and totals, open pipeline and won-this-month figures match direct SQL on `deal`.
14. `GET /api/customers` includes correct `open_deals` and `open_amount` for each customer.

### 10.4 Frontend

15. The header has a **Deals** link for sales users (not admins); reloading on `#deals` stays on the Deals screen.
16. The customers table shows each customer's open deals; the Deals dialog lists, adds, edits and deletes that customer's deals.
17. The Deals screen shows the summary tiles, filters work, Overdue appears on open deals past their close date, and changing the stage from the row updates the summary.
18. Amounts display as Indian rupees (₹1,50,000); the delete-customer dialog warns about the deals that will be deleted.

### 10.5 Assistant, export and docs

19. Asking the assistant "Create a deal for Sunrise Hospital: brochure printing Q4, ₹1,50,000, closing 30 Nov" creates the deal, and the screens refresh.
20. The assistant can list a customer's deals and move a deal to Won; it cannot see another user's deals.
21. **Export All** for a sales user produces a workbook with `Customers` and `Deals` sheets; amounts are numbers in rupee format and dates are dates.
22. Swagger documents all deal endpoints and they can be tested there. Frontend lint and build pass.

## 11. Decisions

The user approved the spec with the recommended answers:

1. **Stage changes:** allow any stage → any stage (correct mistakes, reopen lost deals), or only forward moves plus Lost? **Any → any** (5.2).
2. **Assistant tools for deals:** include them in this spec? **Yes** (7.5); the assistant is a main way users work with customers.
3. **Admin view of deals:** add a pipeline column (open amount, won amount) per sales user to the admin dashboard and its export? **Not in this spec**; a small follow-up once deals are in use.
4. **Deals export category:** include it here (7.4)? **Yes**. It needs spec 04 merged first.
5. **"Won this month" date:** there is no `closed_at` column, so the spec uses `updated_at` of won deals. That moves if a won deal is edited later. **Accepted for now**; adding `closed_at` would need a migration on the shared database.
6. **Branch:** spec 04 (`feature/04-export-excel`) is not merged yet. Finish and merge spec 04 first, then start `feature/05-customer-deals` from `main`.
