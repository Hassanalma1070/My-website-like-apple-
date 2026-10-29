# Plan 02: Password Reset and Change

- **Spec:** [`_specs/02_spec_password_reset.md`](../_specs/02_spec_password_reset.md) (approved 2026-10-29)
- **Status:** Done. Merged to `main` in PR #2, which merged `feature/03-admin-dashboard` (stacked on `feature/02-password-reset`) and so brought in specs 02 and 03 together
- **Branch:** `feature/02-password-reset`

## Step 0: Prepare

Commit the spec and this plan on `main`, then create `feature/02-password-reset`. No new dependencies.

## Step 1: Migration

`backend/sql/002_password_reset.sql` (idempotent, in a transaction):

- `ALTER TABLE app_user ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;`
- `CREATE TABLE IF NOT EXISTS password_reset (...)` as in spec section 4.1.
- `CREATE INDEX IF NOT EXISTS password_reset_user_created_idx ON password_reset (user_id, created_at);`

Run `npm run migrate`. `001_auth.sql` is a no-op on this database.

## Step 2: Session invalidation

- **`src/users.js`:**
  - Include `token_version` in the user returned to the auth code, but never in API responses.
  - Add `getTokenVersion(userId)`.
  - Add `setPassword(userId, passwordHash)`, which updates the hash and increments `token_version` in one statement and returns the user.
- **`src/auth.js`:**
  - `signToken` adds `ver: user.token_version`.
  - `requireAuth` becomes async: after verifying the token, it loads `token_version` and returns `401` if the user is missing or `ver` doesn't match.
- **Responses:** `routes/auth.js` removes `token_version` and `password_hash` from users before sending them, using one `publicUser()` helper.

## Step 3: Reset tokens

New `src/passwordResets.js`:

- `createResetLink(user)`:
  - Counts this user's tokens from the last hour and returns `null` if there are 3 or more.
  - Marks older unused tokens as used.
  - Inserts the SHA-256 hash of 32 random bytes (base64url), expiring in 30 minutes.
  - Returns `{ link, expiresAt }`, with `link = ${FRONTEND_URL}/?reset_token=<token>`.
- `consumeResetToken(token, newPasswordHash)`, in one transaction:
  - `UPDATE password_reset SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`.
  - If a row comes back, call `setPassword`.
  - Returns `true` or `false`. The single `UPDATE` makes the token single-use even with two requests at once.
- `sendPasswordResetLink(user, link)`: logs the link when `NODE_ENV !== "production"`, and otherwise logs a warning that no email provider is configured.

## Step 4: Routes (`src/routes/auth.js`)

- `POST /change-password` (requireAuth):
  - Validate both passwords; the new one must be 8–72 characters and different from the current one.
  - Check the current password. `401` if it's wrong.
  - Call `setPassword` and return `{ token, user }` with the new version.
- `POST /forgot-password`:
  - Validate the email.
  - If the user exists, call `createResetLink`, then `sendPasswordResetLink` when it returns a link.
  - Always return `202` with the same message.
- `POST /reset-password`:
  - Validate the token (a non-empty string) and the new password.
  - Call `consumeResetToken`. Return `400` "This reset link is invalid or has expired" on failure, or `200` on success.

## Step 5: Operator command

- **`backend/scripts/reset-link.js`:** takes the email argument, finds the user, calls `createResetLink`, prints the link and expiry time, and closes the pool. It exits with code 1 if the user isn't found or the hourly limit is reached.
- **`package.json`:** add `"reset-link": "node scripts/reset-link.js"`.

## Step 6: Swagger

- Add `ChangePasswordInput`, `ForgotPasswordInput`, `ResetPasswordInput` and `Message` schemas.
- Add the three paths under **Auth**. `change-password` gets `bearerAuth`.
- Add the console note to `info.description`. Bump the version to `2.1.0`.

## Step 7: Frontend

- **`api.js`:** add `changePassword`, `forgotPassword` and `resetPassword`.
- **`AuthView.jsx`:** add a `forgot` mode (email only, then the generic message), and accept a `notice` prop for the "Password updated, sign in" message.
- **`components/ResetPasswordView.jsx` (new):** new password and confirm. On success, remove `reset_token` from the URL with `history.replaceState` and call `onDone`.
- **`components/ChangePasswordDialog.jsx` (new):** uses `Modal` and the `CustomerForm` field styles. On success, calls `onChanged(session)`.
- **`App.jsx`:**
  - Read `reset_token` from `location.search` on load. If it's present, show `ResetPasswordView`, even when a session exists.
  - Add a **Change password** button in the header user menu.
  - On change, save the new session and show a toast.

## Step 8: Docs and config

- **`.env.example`:** add `FRONTEND_URL=http://localhost:5173`.
- **README:** the new endpoints, `npm run reset-link`, and console delivery.
- **CLAUDE.md:** `token_version` and `requireAuth` checking it on every request; `passwordResets.js`; the `sendPasswordResetLink` email hook.

## Step 9: Verification

On a test server, against the database:

1. Acceptance criteria 1–6 with a test user.
2. Criterion 7: the operator command prints a link that works, using a test user.
3. Frontend lint and build.
4. Delete the test users. Their `password_reset` rows are removed by the cascade.
5. Create user 1's reset link and give it to the user.

## Step 10: Finish

- Commit in steps on the branch, then push and open a PR. If git has no GitHub login, the user pushes, as with PR #1.
- After merge, mark the spec and plan done.
