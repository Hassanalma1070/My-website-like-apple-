# Plan 03: Admin Login and Sales Users Dashboard

- **Spec:** [`_specs/03_spec_admin_login.md`](../_specs/03_spec_admin_login.md) (approved 2026-10-29)
- **Status:** Done. Merged to `main` in PR #2, which merged `feature/03-admin-dashboard` (stacked on `feature/02-password-reset`) and so brought in specs 02 and 03 together
- **Branch:** `feature/03-admin-dashboard`

## Step 0: Prepare

- Merge `feature/02-password-reset` first: spec 03 depends on `token_version`, change password and `reset-link`.
- Commit the spec and this plan on `main`, then create `feature/03-admin-dashboard` from it. The working tree must be clean before implementation starts.
- No new dependencies and no migration: admins are `app_user` rows with `role = 'admin'`.

## Step 1: Role re-queried on every request (`src/users.js`, `src/auth.js`)

- **`src/users.js`:**
  - Replace `getTokenVersion(id)` with `getAuthState(id)`, which returns `{ token_version, role }` or `null` from one query: `SELECT token_version, role FROM app_user WHERE user_id = $1`.
  - Add `createAdmin({ name, email, passwordHash })`: an `INSERT` that sets `role = 'admin'` explicitly and returns the user. Only the seed command calls it; `createUser` still relies on the database default (`sales`).
- **`src/auth.js`:**
  - `requireAuth` calls `getAuthState`. It returns `401` if the user is missing or `ver` doesn't match, and sets `req.user.role` from the **database** row, not the token's `role` claim (spec 5.2, stale tokens).
  - Add `requireRole(role)`: a middleware that returns `403 { error: "Forbidden" }` when `req.user.role !== role`.

## Step 2: Shared credential check and sales login (`src/routes/auth.js`)

- Move the body of the login handler into an exported `checkCredentials(body)` helper: it validates input, finds the user by email and verifies the password, using the dummy hash for unknown emails. It returns either `{ status, error }` or `{ user }`.
- Export the existing `session(user)` helper.
- `POST /api/auth/login`: after `checkCredentials` succeeds, return `403` "Admin accounts sign in on the admin login page." if `user.role === "admin"`. The role is only checked after the password is verified (criterion 10).

## Step 3: Lock the sales routes to `sales`

- **`src/routes/customers.js`:** `router.use(requireAuth, requireRole("sales"))`.
- **`src/routes/agent.js`:** `router.post("/chat", requireAuth, requireRole("sales"), ...)`.

## Step 4: Admin data access (`src/admin.js`, new)

`listSalesUsersWithCustomerCounts()`. A comment marks it as the one query that reads across users, which must stay behind `requireRole("admin")` and must never become an agent tool.

```sql
SELECT u.user_id, u.name, u.email, u.created_at,
       COUNT(c.customer_id)::int AS customer_count
FROM app_user u
LEFT JOIN customer c ON c.sales_user_id = u.user_id
WHERE u.role = 'sales'
GROUP BY u.user_id
ORDER BY u.name, u.user_id;
```

Run it with `SELECT COUNT(*)::int AS total FROM customer` in `Promise.all`, and return:

```js
{ summary: { sales_users: users.length, total_customers }, users }
```

## Step 5: Admin routes (`src/routes/admin.js`, new)

- `POST /login`:
  - `503` via `authNotConfigured` when `JWT_SECRET` is missing, like the other auth routes.
  - `checkCredentials`; return its `400` or `401` unchanged.
  - `403` "This account does not have admin access." if `user.role !== "admin"`.
  - Otherwise `200 session(user)`.
- `GET /users`: `requireAuth, requireRole("admin")`, then `res.json(await listSalesUsersWithCustomerCounts())`.
- **`src/server.js`:** `app.use("/api/admin", adminRoutes)`.

## Step 6: Seed command

- **`backend/scripts/seed-admin.js`**, in the same style as `reset-link.js`:
  - `ADMIN_EMAIL` defaults to `admin@admin.com` and `ADMIN_PASSWORD` defaults to `123456789`. Validate the email and the 8–72 password rule, and exit 1 on failure.
  - `findUserByEmail(email)`:
    - An admin exists: print "Admin <email> already exists. Nothing changed." and exit 0.
    - A sales user has the email: print an error and exit 1, changing nothing.
    - Not found: `createAdmin({ name: "Administrator", email, passwordHash: await hashPassword(password) })`, print the email and a reminder to change the default password after the first login.
  - Close the pool in `finally`.
- **`package.json`:** add `"seed-admin": "node scripts/seed-admin.js"`.

## Step 7: Swagger (`src/swagger.js`)

- Schemas: `AdminSalesUser` (`user_id`, `name`, `email`, `created_at`, `customer_count`), `AdminSummary` (`sales_users`, `total_customers`) and `AdminUsersResponse`.
- An **Admin** tag with `POST /api/admin/login` (reusing `LoginInput` and the auth response) and `GET /api/admin/users` (with `bearerAuth`).
- `403` responses on `/api/admin/users`, every customer path, `/api/agent/chat` and `/api/auth/login`.
- An `info.description` note: sign in on `/api/admin/login` with the seeded admin, then click Authorize. Bump the version to `2.2.0`.

## Step 8: Frontend

- **`api.js`:** add `adminLogin(body)` (`POST /api/admin/login`) and `adminUsers()` (`GET /api/admin/users`).
- **`components/AuthView.jsx`:**
  - Add an `admin` mode to `COPY` (title "Admin sign in").
  - Admin mode shows email and password only and submits through `api.adminLogin`. It hides the register and forgot links.
  - Show an **Admin sign in** link in login mode and **Back to sales sign in** in admin mode.
- **`components/AdminDashboard.jsx` (new):**
  - Loads `api.adminUsers()` on mount and on **Refresh**, with loading and error states like `CustomersView`.
  - Two summary tiles (sales users, total customers) and a table: name, email, joined date and customers (right-aligned). There's an empty-state row when no sales users exist.
- **`App.jsx`:**
  - `const isAdmin = session?.user.role === 'admin'`.
  - Main area: `AdminDashboard` (keyed by `user_id`) when `isAdmin`, otherwise `CustomersView`.
  - When `isAdmin`, hide the **Customers** and **Assistant** links, don't render `ChatWidget`, and show an "Admin" badge in the user menu. **Change password** and **Log out** stay.
- **`index.css`:** styles for the summary tiles, the table and the badge, reusing the existing tokens.

## Step 9: Docs and config

- **`backend/.env.example`:** commented `ADMIN_EMAIL=admin@admin.com` and `ADMIN_PASSWORD=123456789`, with a note to change them for real deployments.
- **README:** the admin login, the dashboard, `npm run seed-admin`, and the advice to change the default password.
- **CLAUDE.md:**
  - `requireAuth` reads the role from the database, and `requireRole` checks it.
  - Customer and agent routes are `sales` only.
  - `src/admin.js` is the single cross-user query: admin only, never an agent tool.
  - The `seed-admin` command.

## Step 10: Verification

Against the shared database, on a local server. Criterion numbers refer to spec section 10.

1. Ask the user to run `npm run seed-admin` twice (criteria 1–2). Check 3–4 with `ADMIN_EMAIL` / `ADMIN_PASSWORD` set to a temporary test sales user's email and a short password; both must fail without changing anything.
2. With `curl` and a temporary sales test user, check criteria 5–23:
   - Compare `customer_count` and the totals with direct `GROUP BY` and `COUNT(*)` queries.
   - For criterion 21, change the test user's role in the database, call an endpoint with the old token, then set the role back.
   - For criterion 22, change the admin password on a test admin, or change it back afterwards, so `admin@admin.com` ends with `123456789`.
3. Frontend: `npm run lint` and `npm run build`. Walk through criteria 24–31 in the browser.
4. Swagger: criteria 32–33. `GET /api/health`: criterion 34.
5. Delete the temporary test users and any customers they created.

## Step 11: Finish

- Commit in steps on the branch, then push and open a PR. If git has no GitHub login, the user pushes, as with PR #1.
- After merge, mark the spec and plan done.
