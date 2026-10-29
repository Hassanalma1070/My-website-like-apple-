# Spec 01: User Registration, Login and Per-User Customer Access

- **Status:** Done. Implemented and merged in PR #1 (2026-10-29)
- **Date:** 2026-10-29
- **Affects:** `backend/` (DB, REST API, agent, Swagger) and `frontend/`

## 1. Background

Right now the application has no authentication. Every caller can read and change every row in the `customer` table, through the REST API, the Swagger UI and the AI agent.

This feature adds user registration and login. Each customer belongs to one sales person, and a logged-in user can only see and manage their own customers.

## 2. Goals

1. A new user can register. Every new user gets the role `sales` by default.
2. A registered user can log in and receive an access token.
3. Every customer is linked to a sales person (the user who owns it).
4. A logged-in user can only list, view, create, update and delete **their own** customers. The CRUD behavior otherwise stays the same.
5. The AI agent follows the same access rules. It only reads and changes the logged-in user's customers.
6. Any attempt to access or change a customer that belongs to another user is denied.
7. The Swagger documentation covers authentication and per-user access, and you can test the whole flow from the Swagger UI (register, log in, authorize, call the customer endpoints).

## 3. Non-goals

- Roles other than `sales` (for example an admin who sees every customer). The `role` column is added so roles can be extended later, but `sales` is the only role used now.
- Password reset, email verification, refresh tokens, logout on the server, and social or OAuth login.
- Reassigning customers between sales people.
- Rate limiting and account lockout.

## 4. Data model

### 4.1 New table `app_user`

(`user` is a reserved word in PostgreSQL, so the table is named `app_user`.)

| Column | Type | Rules |
|---|---|---|
| `user_id` | `SERIAL PRIMARY KEY` | |
| `name` | `TEXT NOT NULL` | |
| `email` | `TEXT NOT NULL UNIQUE` | Stored lowercase and used as the login name |
| `password_hash` | `TEXT NOT NULL` | bcrypt hash. The plain password is never stored or returned. |
| `role` | `TEXT NOT NULL DEFAULT 'sales'` | `CHECK (role IN ('sales'))` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |

### 4.2 Change to the `customer` table

- Add `sales_person_id INTEGER REFERENCES app_user(user_id) ON DELETE CASCADE`.
- Add an index on `sales_person_id`.
- Existing customers have no owner (`NULL`), so no user can see them. See open question 1.

### 4.3 Migration

The repo has no schema or migration files yet. This feature adds `backend/sql/001_auth.sql`, an idempotent script (`IF NOT EXISTS`) that makes the changes above, and an `npm run migrate` script to run it against `DATABASE_URL`.

## 5. Authentication

- **Method:** stateless JWT bearer tokens in an `Authorization: Bearer <token>` header. This works on Vercel serverless and with the Swagger UI **Authorize** button.
- **Token:** signed with HS256 using a new `JWT_SECRET` environment variable, valid for 8 hours (configurable with `JWT_EXPIRES_IN`). Claims: `sub` (user_id), `email`, `role`.
- **Passwords:** hashed with bcrypt (cost 10). At least 8 characters.
- **Server startup:** if `JWT_SECRET` is not set, auth endpoints and protected endpoints respond `503` with a clear message. This follows how the agent behaves today when `ANTHROPIC_API_KEY` is missing.

## 6. API

### 6.1 New endpoints (public)

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/api/auth/register` | `{ name, email, password }` | `201` `{ token, user }` | `400` invalid input, `409` email already registered |
| POST | `/api/auth/login` | `{ email, password }` | `200` `{ token, user }` | `400` invalid input, `401` wrong email or password (the same message for both) |

`user` is `{ user_id, name, email, role, created_at }` and never includes the password hash.

A client cannot set `role` at registration. Any `role` value in the body is ignored.

### 6.2 New endpoint (protected)

| Method | Path | Success |
|---|---|---|
| GET | `/api/auth/me` | `200` the current `user` |

### 6.3 Changes to existing endpoints

| Endpoint | Auth | Behavior |
|---|---|---|
| `GET /api/health` | Public | Unchanged |
| `GET /swagger`, `/swagger.json` | Public | Unchanged |
| `GET /api/customers` | Required | Returns only the caller's customers. `?name=` filtering still works within them. |
| `GET /api/customers/{id}` | Required | `404` if the customer does not exist **or** belongs to another user |
| `POST /api/customers` | Required | `sales_person_id` is always set to the caller. Any `sales_person_id` in the body is ignored. |
| `PUT /api/customers/{id}` | Required | Only the caller's customers can be changed (otherwise `404`). `sales_person_id` cannot be changed. |
| `DELETE /api/customers/{id}` | Required | Only the caller's customers can be deleted (otherwise `404`) |
| `POST /api/agent/chat` | Required | See section 7 |

- A missing, malformed, expired or invalid token returns `401 { "error": "..." }`.
- Access to another user's customer returns `404 Customer not found`, the same as a customer that does not exist, so callers cannot find out which IDs belong to other users. See open question 2.
- The `Customer` response object gains a `sales_person_id` field.

### 6.4 Enforcement

Ownership is enforced **in the SQL itself**: every query in `src/customers.js` takes the caller's `userId` and includes `WHERE sales_person_id = $userId` (and sets it on `INSERT`). Routes and agent tools cannot call the data layer without a user ID, so there is no code path that skips the check.

## 7. AI agent

- `chat(message, history, user)` receives the authenticated user from the route.
- The tools are already built per request. Each tool passes `user.user_id` into the data layer from the closure. **The user ID is never a tool input**, so the model cannot ask for another user's data even if a prompt tells it to.
- The tool names and inputs stay the same: `get_all_customers`, `get_customer_by_name`, `get_customer_by_id`, `add_customer`, `update_customer`, `delete_customer`.
- When a tool asks for a customer the user doesn't own, it gets the same "not found" result as for a missing customer.
- The system prompt adds the user's name and says the assistant only manages that sales person's customers.

## 8. Swagger / OpenAPI

Update `backend/src/swagger.js` (it is written by hand):

- Add `components.securitySchemes.bearerAuth` (`type: http`, `scheme: bearer`, `bearerFormat: JWT`).
- Add an **Auth** tag with the register, login and `me` endpoints, including request and response schemas (`RegisterInput`, `LoginInput`, `AuthResponse`, `User`).
- Mark the customer and agent operations with `security: [{ bearerAuth: [] }]` and add `401` responses. Mention in the descriptions that `404` also covers customers owned by other users.
- Add `sales_person_id` to the `Customer` schema (read-only).
- Replace the "No authentication is required" text in `info.description` with short steps: register or log in, copy the `token`, click **Authorize**, paste it.

**Manual test through Swagger:** register user A and user B. As A, create a customer. As B, `GET`, `PUT` and `DELETE` that customer ID all return `404`, and B's `GET /api/customers` does not include it. Calls without a token return `401`.

## 9. Frontend

- **Login and Register screens** appear when there is no valid token. You can switch between them. Errors from the API are shown inline.
- After login or registration, the token and user are saved in `localStorage` and the current app (customer table and chat) is shown.
- **Header:** shows the logged-in user's name and a **Log out** button. Logging out clears the token, the customer data and the chat conversation.
- **`src/api.js`:** sends `Authorization: Bearer <token>` on every request. A `401` response logs the user out and returns them to the login screen.
- The customer table and chat widget otherwise work as they do today.

## 10. Configuration

New variables in `backend/.env` and `backend/.env.example`:

| Variable | Required | Default |
|---|---|---|
| `JWT_SECRET` | Yes | (none) |
| `JWT_EXPIRES_IN` | No | `8h` |

New backend dependencies: `bcryptjs` (pure JS, works on Vercel) and `jsonwebtoken`.

**Dependency (software supply chain) rules:**

- Pin new dependencies to exact versions (`bcryptjs@3.0.3`, `jsonwebtoken@9.0.3`), with no `^` or `~` ranges, and commit the updated `package-lock.json`.
- Only add well-established, widely used packages. No new dependency for anything a few lines of code can do.
- Install with `npm ci` from the lockfile, and `npm audit` must report no high or critical vulnerabilities before the work is merged.

## 11. Acceptance criteria

1. `POST /api/auth/register` creates a user with role `sales` and returns a token. Registering the same email again returns `409`.
2. `POST /api/auth/login` returns a token for the right password and `401` for a wrong email or password.
3. Every `/api/customers` and `/api/agent/chat` call without a valid token returns `401`.
4. A customer created by user A has `sales_person_id` = A, and only A can see, update or delete it. User B gets `404` for every one of those calls.
5. Asking the agent as user B to list, find, update or delete user A's customers returns no data and changes nothing.
6. The Swagger UI shows an **Authorize** button, and every step in section 8's manual test works from it.
7. The frontend shows the login screen when logged out, shows only the user's own customers when logged in, and returns to the login screen on logout or an expired token.
8. `README.md` and `CLAUDE.md` describe the new auth setup and environment variables.

## 12. Decisions

The user approved the spec and asked for industry best practice on the open questions:

1. **Existing customers stay unowned and hidden.** The migration does not assign or delete them: assigning them automatically could show customer data to the wrong sales person, and deleting them loses data. An operator can assign them later with one SQL statement, which the migration file documents in a comment:
   `UPDATE customer SET sales_person_id = <user_id> WHERE sales_person_id IS NULL;`
2. **`404 Not found` for another user's customer.** This follows the OWASP guidance against revealing which IDs exist (object enumeration).
3. **Bearer token in `localStorage`, with an 8-hour expiry.** httpOnly cookies are stronger against XSS, but they would need cross-site cookies between the separate Vercel domains, CORS with credentials (which can't be used with `CORS_ORIGIN=*`), and CSRF protection, and Swagger testing uses a bearer token anyway. The risk is reduced by the short expiry, React's default escaping, and never rendering raw HTML from chat Markdown.

## Implementation note (2026-10-29)

The shared database already had the auth schema when implementation started: `app_user` exists, and the owner column on `customer` is named **`sales_user_id`** (already `NOT NULL`, with every existing customer assigned). The implementation uses that existing column instead of adding `sales_person_id`, and the `Customer` response field is `sales_user_id`. Decision 1 (unowned customers) therefore does not apply. The database role check also allows `admin`; this feature still only creates `sales` users and gives `admin` users no extra access. `customer.email` is unique across all users, so creating or updating a customer with an email another user's customer already has returns `409`.
