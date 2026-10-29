# Spec 03: Admin Login and Users Dashboard

- **Status:** Approved (2026-10-29)
- **Date:** 2026-10-29
- **Depends on:** Spec 01 (registration, login, per-user access), Spec 02 (token version, change password)
- **Affects:** `backend/` (auth, new admin API, seed command, Swagger) and `frontend/`

## 1. Background

Every account that can sign in today is a `sales` user. The `app_user.role` column already allows `admin` (`CHECK (role IN ('sales', 'admin'))`), but no admin account exists and nothing in the app uses the role.

The business wants an administrator who signs in separately from the sales people and sees an overview of who uses the application and how many customers each person manages.

## 2. Goals

1. An admin signs in through a **separate admin login**, not the sales sign-in form.
2. A signed-in admin sees a **dashboard** that lists every **sales** user of the application with the **number of customers** linked to each one.
3. A default admin account exists: email **`admin@admin.com`**, password **`123456789`**.
4. Admin and sales sessions are kept apart: a sales user cannot open the admin dashboard or call the admin API, and an admin does not get the sales customer screens or the AI agent.
5. The new endpoints are documented in Swagger and can be tested there.

## 3. Non-goals

- Admin actions on users or customers: creating, editing, deleting, disabling or changing the role of users, reassigning customers, or viewing a user's individual customers. The dashboard is read-only. (Possible later spec.)
- Promoting a user to admin from the UI or the API. Registration still always creates `sales` users.
- Pagination, search or sorting controls on the dashboard. The user count is small.
- The `deal` table.
- Audit logging of admin activity.

## 4. Data model

**No schema change.** Admins are rows in the **same `app_user` table** with `role = 'admin'`; there is no separate admin table. `app_user.role` already accepts `admin`, and the `customer.sales_user_id` link already exists. No migration file is added.

### 4.1 Default admin account

A new operator command creates the default admin:

```bash
cd backend
npm run seed-admin
```

- Creates `app_user` row `{ name: "Administrator", email: "admin@admin.com", role: "admin" }`.
- **Password:** `123456789` by default, stored only as a bcrypt hash. It can be overridden with `ADMIN_PASSWORD` in `backend/.env` (same 8–72 character rule as registration).
- The email can be overridden with `ADMIN_EMAIL`; the default is `admin@admin.com`.
- **Idempotent:** if an admin with that email already exists, it does nothing and does not reset the password. If a **sales** user already has that email, it stops with an error and changes nothing (it never promotes an existing account).
- Seeding is a command rather than a SQL migration because the password must be hashed with the app's bcrypt code, and the shared database may not have `pgcrypto`.
- A forgotten admin password is recovered with the existing `npm run reset-link -- admin@admin.com` (spec 02), and the admin can change it with **Change password**.

> **Security note:** `123456789` is a weak, publicly known password. It is accepted for this lab, but the admin should change it right after the first login, and it must be overridden with `ADMIN_PASSWORD` for any real deployment.

## 5. Behavior

### 5.1 Separate logins

| Endpoint | Accepts | Rejects |
|---|---|---|
| `POST /api/auth/login` (existing sales login) | `sales` users | `admin` users: `403` "Admin accounts sign in on the admin login page." |
| `POST /api/admin/login` (new) | `admin` users | `sales` users: `403` "This account does not have admin access." |

- A wrong email or password returns the same `401` "Invalid email or password" on both, with the same constant-time handling as today (dummy hash for unknown emails).
- The `403` is only returned **after** the password has been verified, so it never reveals the role of an account to someone who doesn't know its password.
- Both return the same `{ token, user }` shape. `user.role` tells the frontend which screen to show.

### 5.2 Role checks on the server

- **Stale tokens:** the role is re-queried from the **database** on every request (in the same query `requireAuth` already makes for `token_version`), not trusted from the `role` claim in the token. A role change therefore takes effect immediately, and a token issued before the change can't keep the old role.
- `requireAuth` sets `req.user.role` from the database value.
- New middleware `requireRole(role)` returns `403 { error: "Forbidden" }` when `req.user.role` doesn't match.
- Route access:

| Routes | Allowed role |
|---|---|
| `/api/customers/*`, `/api/agent/chat` | `sales` only (admin gets `403`) |
| `/api/admin/*` (except `/api/admin/login`) | `admin` only (sales gets `403`) |
| `/api/auth/me`, `/api/auth/change-password`, forgot/reset password | any signed-in user / public, as today |

### 5.3 Cross-user query

The dashboard query is the **only** query that reads across users. It lives in the admin data-access module, is reachable only behind `requireRole("admin")`, and is never exposed as an agent tool. The per-user rule in `customers.js` (every function takes `userId` and filters on `sales_user_id`) is unchanged.

## 6. API

| Method | Path | Auth | Body | Success | Errors |
|---|---|---|---|---|---|
| POST | `/api/admin/login` | Public | `{ email, password }` | `200 { token, user }` | `400` invalid input, `401` wrong credentials, `403` not an admin |
| GET | `/api/admin/users` | Admin | none | `200 { summary, users }` | `401` not signed in, `403` not an admin |

`GET /api/admin/users` response:

```json
{
  "summary": { "sales_users": 3, "total_customers": 27 },
  "users": [
    {
      "user_id": 3,
      "name": "Sam Seller",
      "email": "sam@example.com",
      "created_at": "2026-10-29T10:00:00.000Z",
      "customer_count": 11
    }
  ]
}
```

- `users` includes **only sales users** (`role = 'sales'`), sorted by name, then `user_id`. Admin accounts are not listed.
- `customer_count` is the number of `customer` rows whose `sales_user_id` is that user; users with no customers show `0`.
- `password_hash` and `token_version` are never returned.
- `total_customers` counts every customer row (including any with no owner).

## 7. Frontend

- **Sign-in screen:** a small **"Admin sign in"** link under the sales form switches to an admin login form (email and password only; no register or forgot links, title "Admin sign in"). A **"Back to sales sign in"** link returns. The admin form calls `POST /api/admin/login`.
- **After login**, `App.jsx` picks the screen from `session.user.role`:
  - `sales`: the existing customers screen, Assistant link and chat widget, unchanged.
  - `admin`: a new **Admin dashboard** screen. The header hides **Customers** and **Assistant**, and the chat widget is not rendered. **Change password** and **Log out** stay, and an "Admin" badge appears next to the name.
- **Admin dashboard:**
  - Summary tiles: sales users, total customers.
  - A table of sales users: name, email, joined date, customers (right-aligned number). Sales users with zero customers are shown, not hidden.
  - A **Refresh** button, loading and error states, matching the look of `CustomersView`.
- A session restored from `localStorage` routes the same way, so reloading the page keeps the admin on the dashboard.
- No router is added.

## 8. Swagger

- New **Admin** tag with the two endpoints, request and response schemas (`AdminUserRow`, `AdminUsersResponse`) and examples.
- `GET /api/admin/users` uses `bearerAuth`.
- Document the `403` responses on the customer and agent endpoints for admin tokens, and on the sales login for admin accounts.
- Note in `info.description` how to get an admin token (admin login with the seeded account). Bump the version to `2.2.0`.

## 9. Configuration

| Variable | Required | Default |
|---|---|---|
| `ADMIN_EMAIL` | No (seed command only) | `admin@admin.com` |
| `ADMIN_PASSWORD` | No (seed command only) | `123456789` |

No new dependencies.

## 10. Acceptance criteria

The feature is done when every item below has been checked against the shared database.

### 10.1 Default admin account

1. `npm run seed-admin` creates one `app_user` row with `email = 'admin@admin.com'`, `role = 'admin'` and a bcrypt `password_hash` (not the plain text `123456789`). No new table exists.
2. Running `npm run seed-admin` a second time exits successfully, prints that the admin already exists, and leaves the row (including `password_hash` and `token_version`) unchanged.
3. With `ADMIN_EMAIL` set to the email of an existing **sales** user, the command exits with an error and that user's role and password are unchanged.
4. With `ADMIN_PASSWORD` set, the admin is created with that password instead, and a value shorter than 8 characters is rejected.

### 10.2 Admin login

5. `POST /api/admin/login` with `admin@admin.com` / `123456789` returns `200` with `{ token, user }`, where `user.role = "admin"` and `user` has no `password_hash` or `token_version`.
6. `POST /api/admin/login` with a wrong password, or an unknown email, returns `401` "Invalid email or password". The two cases return the same message.
7. `POST /api/admin/login` with a **sales** user's correct email and password returns `403` "This account does not have admin access." and no token.
8. `POST /api/admin/login` with a missing or malformed email or password returns `400`.

### 10.3 Sales login unchanged

9. `POST /api/auth/login` with the admin's correct credentials returns `403` "Admin accounts sign in on the admin login page." and no token.
10. `POST /api/auth/login` with an admin email and a **wrong** password returns `401`, not `403` (the role is not revealed).
11. A sales user can still register, log in and manage their customers exactly as before; registration still always creates `role = 'sales'`, even if the request body includes `role: "admin"`.

### 10.4 Dashboard API

12. `GET /api/admin/users` with the admin token returns `200` with `summary` and `users`.
13. `users` contains every `app_user` row with `role = 'sales'`, and no admin row, sorted by name.
14. Each `customer_count` matches `SELECT sales_user_id, COUNT(*) FROM customer GROUP BY 1` for that user, and a sales user with no customers appears with `customer_count = 0`.
15. `summary.sales_users` equals the number of rows in `users`, and `summary.total_customers` equals `SELECT COUNT(*) FROM customer`.
16. No row in the response contains `password_hash` or `token_version`.
17. After a sales user adds a customer, the next `GET /api/admin/users` shows that user's count increased by 1.

### 10.5 Access control

18. `GET /api/admin/users` without a token returns `401`, and with a sales token returns `403`.
19. An admin token gets `403` on `GET /api/customers`, `POST /api/customers`, `PUT /api/customers/{id}`, `DELETE /api/customers/{id}` and `POST /api/agent/chat`.
20. A sales token still gets `200` on its own customers and `404` on another user's customer, as in spec 01.
21. **Stale tokens:** if a user's role is changed in the database, their existing token gets the new role's access on the very next request, without logging in again.
22. After the admin changes their password, the old admin token gets `401` and the new one works (spec 02 behavior holds for admins).
23. `npm run reset-link -- admin@admin.com` produces a link that sets a new admin password.

### 10.6 Frontend

24. The sign-in screen shows an **Admin sign in** link; it opens the admin form (email and password only, no register or forgot links), and **Back to sales sign in** returns to the sales form.
25. Signing in on the admin form with the admin credentials shows the **Admin dashboard**. The header has no **Customers** or **Assistant** links, the chat widget is not shown, and an "Admin" badge is next to the name.
26. The dashboard shows the sales users count, the total customers, and a table of sales users (name, email, joined date, customers) whose numbers match the API. Users with 0 customers are listed.
27. **Refresh** reloads the data, and an API error is shown as a message instead of a blank screen.
28. Reloading the page keeps the admin on the dashboard; **Log out** returns to the sign-in screen.
29. Signing in with admin credentials on the **sales** form shows the "Admin accounts sign in on the admin login page." error, and a sales account on the admin form shows "This account does not have admin access."
30. A signed-in sales user sees the customers screen and chat as before, and no admin UI.
31. **Change password** works for the admin and keeps them signed in.

### 10.7 Swagger and build

32. Swagger shows an **Admin** tag with `POST /api/admin/login` and `GET /api/admin/users`, and both can be tested there (log in, Authorize, call `/api/admin/users`).
33. The `403` responses are documented on the admin users endpoint, the customer and agent endpoints, and the sales login. The spec version is `2.2.0`.
34. `npm run lint` and `npm run build` pass in `frontend/`, and `GET /api/health` returns `ok`.

## 11. Decisions

The user answered the open questions:

1. **Default password:** `123456789`, overridable with `ADMIN_PASSWORD` (see the security note in 4.1).
2. **Dashboard rows:** only sales users are listed; admin accounts are not.
3. **Stale tokens:** the role is re-queried from the database on every request (5.2).
4. **Storage:** admins live in the same `app_user` table with `role = 'admin'`; no separate table.

Accepted with the spec's approval:

5. **Admins don't use the sales screens:** admin tokens get `403` on the customer and agent routes, and the admin UI shows only the dashboard.
6. **Seeding:** the user runs `npm run seed-admin` against the shared database (as with migrations, Claude may be blocked from writing to it).
