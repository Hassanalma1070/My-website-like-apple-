# Plan 01: User Registration, Login and Per-User Customer Access

- **Spec:** [`_specs/01_spec_userlogin_registration.md`](../_specs/01_spec_userlogin_registration.md) (approved 2026-10-29)
- **Status:** Ready for implementation
- **Branch:** `feature/01-user-auth` (created from `main` after the spec and plan are committed)

## Step 0: Prepare

1. Commit the spec and this plan on `main`, so the working tree is clean (CLAUDE.md workflow rule).
2. Create branch `feature/01-user-auth`.
3. In `backend/`, install the new dependencies pinned to exact versions:
   `npm install --save-exact bcryptjs@3.0.3 jsonwebtoken@9.0.3`
4. Run `npm audit`. It must report no high or critical vulnerabilities.

## Step 1: Database migration

**New file `backend/sql/001_auth.sql`** (idempotent, runs in a transaction):

- `CREATE TABLE IF NOT EXISTS app_user (...)` with the columns, `UNIQUE (email)` and `CHECK (role IN ('sales'))` from spec section 4.1.
- `ALTER TABLE customer ADD COLUMN IF NOT EXISTS sales_person_id INTEGER REFERENCES app_user(user_id) ON DELETE CASCADE;`
- `CREATE INDEX IF NOT EXISTS customer_sales_person_id_idx ON customer (sales_person_id);`
- A comment with the `UPDATE` statement for assigning the existing unowned customers (spec decision 1).

**New file `backend/scripts/migrate.js`:** loads `dotenv/config`, reads every `sql/*.sql` file in name order, runs each through the existing `pool` from `src/db.js`, then closes the pool.

**`backend/package.json`:** add the script `"migrate": "node scripts/migrate.js"`.

> The migration changes the shared Render database. It is run only after the user confirms.

## Step 2: Auth module

**New file `backend/src/auth.js`**, the only place that deals with passwords and tokens:

- `hashPassword(plain)` and `verifyPassword(plain, hash)` using bcryptjs (cost 10).
- `signToken(user)` → JWT (HS256) with `sub`, `email` and `role`, expiring after `JWT_EXPIRES_IN` (default `8h`).
- `requireAuth` Express middleware:
  - `503` if `JWT_SECRET` is not set.
  - `401` if the `Authorization: Bearer` header is missing, or the token is invalid or expired. `jwt.verify` is called with `algorithms: ["HS256"]` so other algorithms (including `none`) are rejected.
  - On success, sets `req.user = { user_id, email, role }`.

**New file `backend/src/users.js`**, the data access for `app_user`, in the same style as `customers.js`:

- `createUser({ name, email, passwordHash })`: stores the email lowercase. A PostgreSQL unique violation (`23505`) is turned into a "duplicate" error that the route returns as `409`.
- `findUserByEmail(email)`, which includes `password_hash` and is only used for login.
- `getUserById(id)`, which never selects `password_hash`.

**New file `backend/src/routes/auth.js`:**

- `POST /register`: validates the name (required), the email (using the same regex as the customer routes) and the password (at least 8 characters). Any `role` in the body is ignored. Returns `201 { token, user }`, or `409` if the email is taken.
- `POST /login`: on an unknown email, still runs one bcrypt comparison against a fixed dummy hash, so the response time doesn't reveal whether the email exists. Returns `401 "Invalid email or password"` for both failures.
- `GET /me` (behind `requireAuth`): returns the current user, or `401` if the account no longer exists.

## Step 3: Per-user customer access

**`backend/src/customers.js`:** every function takes `userId` as its **first** argument and scopes its SQL to it:

- `listCustomers(userId)` and `findCustomersByName(userId, name)`: add `WHERE sales_person_id = $1`.
- `getCustomerById(userId, id)`, `updateCustomer(userId, id, fields)` and `deleteCustomer(userId, id)`: add `AND sales_person_id = $n`. When no row matches, they return `null`, so a missing customer and another user's customer look the same (→ `404`).
- `createCustomer(userId, { name, email, phone })`: inserts `sales_person_id = userId`.
- Add `sales_person_id` to `COLUMNS`. `updateCustomer` keeps its whitelist of `name`, `email` and `phone`, so `sales_person_id` can never be changed.

**`backend/src/routes/customers.js`:** use `router.use(requireAuth)` and pass `req.user.user_id` to every data-layer call. Validation stays the same.

## Step 4: Agent

- **`backend/src/routes/agent.js`:** use `requireAuth` and call `chat(message, history, req.user)`.
- **`backend/src/agent.js`:**
  - `chat(message, history, user)` passes `user` to `buildTools(toolCalls, user)`. Every tool's `run` calls the data layer with `user.user_id` from the closure. The tool input schemas do not change, and none of them include a user ID.
  - The system prompt becomes a function of the user. It adds: "You are assisting sales person <name>. You can only see and manage this sales person's customers. If a customer is not found, say it was not found; do not speculate about other users' data."
  - Look up the user's name with `getUserById` inside `chat`, so the name isn't taken from the token.

## Step 5: Server wiring

**`backend/src/server.js`:**

- Mount `app.use("/api/auth", authRoutes)`.
- Leave `/api/health`, `/swagger` and `/swagger.json` public.

## Step 6: Swagger

**`backend/src/swagger.js`:**

- `components.securitySchemes.bearerAuth = { type: "http", scheme: "bearer", bearerFormat: "JWT" }`.
- New schemas: `User`, `RegisterInput` (required `name`, `email`, `password`), `LoginInput` and `AuthResponse` (`token`, `user`). Add `sales_person_id` (`readOnly`) to `Customer`.
- An **Auth** tag with `/api/auth/register`, `/api/auth/login` and `/api/auth/me`, with examples and their `400`, `401` and `409` responses.
- `security: [{ bearerAuth: [] }]` and a shared `401` response on every customer and agent operation. The `404` descriptions say "not found, or owned by another user".
- Rewrite `info.description` with the four Swagger testing steps (register or log in → copy the token → **Authorize** → call the endpoints).
- Bump `info.version` to `2.0.0`, because the API now requires authentication (a breaking change).

## Step 7: Frontend

- **`frontend/src/auth.js` (new):** read, save and clear `{ token, user }` in `localStorage` under one key, with every access wrapped in `try/catch`.
- **`frontend/src/api.js`:**
  - Add the `Authorization` header when a token exists.
  - On a `401`, clear the session and call a registered `onUnauthorized` callback.
  - Add `register(body)`, `login(body)` and `me()`.
- **`frontend/src/components/AuthView.jsx` (new):** one card that switches between **Log in** and **Register**. It uses the existing form and field styles from `CustomerForm.jsx` and `index.css`, and shows API errors inline.
- **`frontend/src/App.jsx`:**
  - Keep `session` in state, starting from storage. If there is no session, render `AuthView` instead of the main view.
  - The header shows the user's name and a **Log out** button.
  - On logout or `onUnauthorized`: clear the session and remount `CustomersView` and `ChatWidget` (give them a `key` based on `user_id`), which resets the customer list and the chat history.
- **`ChatWidget` and `CustomersView`:** no logic changes.
- **`index.css`:** add only the styles the auth card and header user menu need, reusing the existing tokens.

## Step 8: Docs and config

- **`backend/.env.example`:** add `JWT_SECRET=` (with a comment to generate one with `openssl rand -hex 32`) and `JWT_EXPIRES_IN=8h`.
- **`README.md`:** auth setup, `npm run migrate`, the new endpoints, the Swagger testing steps, and the fact that all customer and agent endpoints now need a token.
- **`CLAUDE.md`:** update the architecture sections:
  - `auth.js` and `users.js`.
  - The "every data-layer function takes `userId` first" rule.
  - Agent tools get the user from the closure, never from tool input.
  - The migration command and the new environment variables.

## Step 9: Verification

There is no test framework in the repo, and the spec doesn't add one. Verify with:

1. `cd frontend && npm run lint && npm run build`.
2. `npm audit` in `backend/`.
3. With the backend running, a `curl` script that covers acceptance criteria 1 to 4:
   - Register A and B, and a duplicate registration (`409`).
   - A good login, and a bad login (`401`).
   - Calls with no token (`401`).
   - A creates a customer. B gets `404` on `GET`, `PUT` and `DELETE` for it, and B's list doesn't include it.
4. Agent check (criterion 5): as B, ask the agent to list A's customer and to delete A's customer by ID. Confirm that nothing comes back and the row still exists.
5. Swagger check (criterion 6): run the manual flow from spec section 8 in the UI.
6. Frontend check (criterion 7): log in, log out, and an expired or invalid token sends the user back to the login screen.

Steps 3 to 6 need the database migrated and `JWT_SECRET` and `ANTHROPIC_API_KEY` set.

## Step 10: Finish

Commit in logical steps on the feature branch (migration, auth, customer scoping, agent, Swagger, frontend, docs). Then ask the user whether to merge into `main` or open a PR.

## Deployment notes (not done in this plan)

- Set `JWT_SECRET` in the Vercel backend project's environment variables, and run `npm run migrate` against the production database before deploying the backend.
- Deploy the backend and the frontend together. The old frontend will get `401` from the new backend.
