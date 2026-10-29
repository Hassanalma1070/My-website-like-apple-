# Customer Hub

Two projects that run on separate ports:

| Project | Stack | Port |
|---|---|---|
| `backend/` | Node.js, Express, PostgreSQL (`pg`), Swagger UI, Anthropic SDK | 4000 |
| `frontend/` | React + Vite | 5173 |

The backend allows cross-origin requests (CORS). The frontend calls it over REST.

Users register and sign in. Every customer belongs to one sales person (`customer.sales_user_id`), and each user can only see and change their own customers, through the REST API, the UI and the AI agent. Another user's customer returns `404`, the same as one that does not exist.

Sales users also track **deals**: sales opportunities with a customer (title, amount in ₹, stage Lead → Qualified → Proposal → Won / Lost, expected close date). A customer can have many deals.

Admins sign in separately and see a read-only dashboard of every sales user and how many customers each one owns. Admins don't use the customer screens or the agent.

## Backend

```bash
cd backend
npm install
# edit .env: set DATABASE_URL, ANTHROPIC_API_KEY and JWT_SECRET (openssl rand -hex 32)
npm run migrate    # applies sql/*.sql in order (idempotent)
npm run seed-admin # creates the default admin (admin@admin.com / 123456789)
npm run dev        # or: npm start
```

- Swagger UI: http://localhost:4000/swagger (raw spec at `/swagger.json`)
- Configuration is in `backend/.env`: `PORT`, `DATABASE_URL`, `CORS_ORIGIN` (comma-separated origins or `*`), `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-opus-5-5`), `JWT_SECRET` (required), `JWT_EXPIRES_IN` (default `8h`), `FRONTEND_URL` (used in password reset links, default `http://localhost:5173`), `ADMIN_EMAIL` and `ADMIN_PASSWORD` (only for `npm run seed-admin`)

### Endpoints

All customer and agent endpoints need an `Authorization: Bearer <token>` header and return `401` without a valid one. They are for sales users only: an admin token gets `403`.

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Register `{ name, email, password }` (password at least 8 characters). New users always get the role `sales`. Returns `{ token, user }`. |
| POST | `/api/auth/login` | Log in as a sales user with `{ email, password }`. Returns `{ token, user }`. Admin accounts get `403`. |
| GET | `/api/auth/me` | The logged-in user |
| POST | `/api/auth/change-password` | `{ currentPassword, newPassword }` while logged in. Returns a new `{ token, user }` and signs out every older token. |
| POST | `/api/auth/forgot-password` | `{ email }`. Always returns `202` with the same message. Creates a single-use reset link that expires in 30 minutes (at most 3 per user per hour). |
| POST | `/api/auth/reset-password` | `{ token, newPassword }` with the `reset_token` from a reset link. Signs out every older token. |
| GET | `/api/customers` | Your customers (`?name=ali` filters by partial name) |
| GET | `/api/customers/{id}` | One of your customers |
| POST | `/api/customers` | Create a customer owned by you (`name` required; `email` and `phone` optional). `409` if the email is already used by any customer. |
| PUT | `/api/customers/{id}` | Update the fields you send |
| DELETE | `/api/customers/{id}` | Delete |
| GET | `/api/customers/{id}/deals` | One of your customers' deals |
| GET | `/api/deals` | Your deals and pipeline totals. Query: `stage` (a stage, `open` or `closed`), `customer_id`, `q` (title), `tz` |
| GET | `/api/deals/{id}` | One of your deals |
| POST | `/api/deals` | `{ customer_id, title, amount, stage?, expected_close_date? }` for one of your customers (`404` otherwise) |
| PUT | `/api/deals/{id}` | Update any of `title`, `amount`, `stage`, `expected_close_date` (`null` clears it). The customer can't change. |
| DELETE | `/api/deals/{id}` | Delete one of your deals |
| POST | `/api/agent/chat` | Ask a question in natural language: `{ "message": "Get all customers", "history": [] }` |
| POST | `/api/admin/login` | Admin login with `{ email, password }`. Returns `{ token, user }`. Sales accounts get `403`. |
| GET | `/api/admin/users` | Admin only. `{ summary: { sales_users, total_customers }, users: [{ user_id, name, email, created_at, customer_count }] }` for every sales user. |
| GET | `/api/export/categories` | The categories you can export: `customers` (sales users) or `sales_users` (admins) |
| GET | `/api/export` | Download an `.xlsx` workbook. Query: `categories` (keys or `all`), optional `q` (customers search), `from` / `to` (`YYYY-MM-DD`), `tz`. `403` for a category your role can't export, `413` above 100,000 rows. |
| GET | `/api/health` | Health check, including the database connection |

### Testing auth in Swagger

1. Call `POST /api/auth/register` (or `login`) and copy the `token`.
2. Click **Authorize** and paste the token.
3. Call the customer and agent endpoints.
4. Register a second user, authorize as them, and try to read, update or delete the first user's customers: each call returns `404`.

### Password reset

No email provider is configured yet. Outside production, `forgot-password` prints the reset link in the backend console. An operator can also create a link for any user:

```bash
npm run reset-link -- user@example.com
```

### Admin

```bash
npm run seed-admin
```

Creates the admin `admin@admin.com` with the password `123456789`, or the values of `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`. Running it again changes nothing, and it never turns an existing sales user into an admin. **The default password is weak: change it after the first login** (header, **Change password**). A forgotten admin password can be reset with `npm run reset-link -- admin@admin.com`.

In the frontend, use the **Admin sign in** link under the sign-in form. In Swagger, call `POST /api/admin/login`, click **Authorize**, then call `GET /api/admin/users`.

The role is read from the database on every request, so changing a user's role takes effect on their existing token right away.

### Export to Excel

Users can export the data they can view to an Excel workbook, one sheet per category:

| Role | Category | Sheet |
|---|---|---|
| sales | `customers` | Your customers: ID, name, email, phone (as text), created |
| sales | `deals` | Your deals: ID, customer, title, amount (₹), stage, expected close, created, updated |
| admin | `sales_users` | Sales users with joined date and customer count |

- In the app: **Export to Excel** on the customers screen (uses the current search) and on the admin dashboard, and **Export** in the header (choose categories and an optional date range).
- Headers are bold and frozen, columns are fitted, numbers are numbers and dates are dates in your time zone. File name: `CustomerHub_<Category or All>_<YYYY-MM-DD_HHmm>.xlsx`.
- At most 100,000 rows per export (`MAX_EXPORT_ROWS` in `src/exports.js`); larger exports get `413`.
- Every export is logged in the `export_log` table (user, time, categories, filters, row count, status). It is created by `sql/003_export_log.sql`, so run `npm run migrate` after pulling.

### Deals

- Deal endpoints are for sales users only (admins get `403`); another user's deal returns `404`, like customers. Deleting a customer deletes its deals.
- `amount` is sent and returned as a string with two decimals (`"150000.00"`); input can be a number or a string. `expected_close_date` is `"YYYY-MM-DD"` or `null`.
- Any stage can be set from any other. Open = lead, qualified, proposal. The customers list includes `open_deals`, `open_amount` and `total_deals` per customer.
- Uses the existing `deal` table; no migration.

### Agent

`POST /api/agent/chat` sends the question to Claude through the Anthropic SDK's tool runner. Claude can use these tools, which only reach the logged-in user's customers:

`get_all_customers`, `get_customer_by_name`, `get_customer_by_id`, `add_customer`, `update_customer`, `delete_customer`, `get_deals`, `get_customer_deals`, `add_deal`, `update_deal`, `delete_deal`

The response contains the reply and the tools that ran: `{ "reply": "...", "toolCalls": [{ "name": "get_all_customers", "input": {}, "ok": true }] }`.

## Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

The backend URL is set with `VITE_API_URL` in `frontend/.env` (default `http://localhost:4000`).

- **Sign in**: a sign-in and registration screen is shown until you log in, with a **Forgot password?** link. Opening a reset link shows a **Set a new password** screen. **Change password** is in the header. The header shows your name and a **Log out** button. An expired session returns you to the sign-in screen.
- **Layout**: top header bar with API status and a Swagger link, the full-width customer page, and a floating chat button in the bottom-right corner
- **Customers**: table with search, totals, and add, edit and delete dialogs
- **AI Assistant** (chat button): chat panel with suggested prompts. Answers render as Markdown and show which tools ran. The customer table refreshes when the assistant changes data. Closing the panel keeps the conversation.
