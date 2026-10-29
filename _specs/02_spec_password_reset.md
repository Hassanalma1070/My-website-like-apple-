# Spec 02: Password Reset and Change

- **Status:** Approved (2026-10-29)
- **Date:** 2026-10-29
- **Depends on:** Spec 01 (registration, login, per-user access)
- **Affects:** `backend/` (DB, auth API, Swagger) and `frontend/`

## 1. Background

Spec 01 added login, but a user who forgets their password has no way back in. One existing account (user 1, who owns 11 customers) already can't log in, because its stored password hash is a placeholder (`x`), not a real bcrypt hash.

The project has no email service, so a reset link can't be emailed today.

## 2. Goals

1. A logged-in user can **change** their password by entering the current one.
2. A user who forgot their password can request a **reset link** and set a new password with it.
3. An operator can create a reset link for a user from the command line. This is how user 1 gets access back.
4. After a password changes, every token issued before the change stops working (other devices are signed out).
5. The new endpoints are documented in Swagger and can be tested there.

## 3. Non-goals

- Choosing and setting up an email provider. See open question 1.
- Changing your email address, two-factor login, and "remember me".
- Admin screens for managing users (a possible spec 03).

## 4. Data model (migration `sql/002_password_reset.sql`, idempotent)

### 4.1 New table `password_reset`

| Column | Type | Rules |
|---|---|---|
| `reset_id` | `SERIAL PRIMARY KEY` | |
| `user_id` | `INTEGER NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE` | |
| `token_hash` | `TEXT NOT NULL UNIQUE` | SHA-256 of the token. The token itself is never stored. |
| `expires_at` | `TIMESTAMPTZ NOT NULL` | 30 minutes after creation |
| `used_at` | `TIMESTAMPTZ` | Set when the token is used. A token works only once. |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |

### 4.2 Change to `app_user`

- Add `token_version INTEGER NOT NULL DEFAULT 0`. It goes up by 1 every time the password changes.

## 5. Behavior

### 5.1 Reset tokens

- 32 random bytes from `crypto.randomBytes`, sent as a URL-safe string.
- The lookup hashes the token it receives and compares that with `token_hash`.
- A token is valid only if it is unused and not expired.
- Creating a new token for a user cancels (marks used) that user's older unused tokens.
- At most **3** reset requests per user per hour, counted in the database (an in-memory counter doesn't work on Vercel serverless). Requests beyond that are silently ignored.

### 5.2 Signing out other sessions

- Login tokens carry a `ver` claim equal to the user's `token_version`.
- `requireAuth` loads the user's `token_version` and rejects a token whose `ver` doesn't match (`401`). This adds one small indexed query per request.
- Changing or resetting a password increments `token_version`, so all older tokens stop working.
- A change-password response returns a new token, so the device that made the change stays signed in.

### 5.3 Password rules

The same rules as registration: 8 to 72 characters. The new password must be different from the current one.

## 6. API

| Method | Path | Auth | Body | Success | Errors |
|---|---|---|---|---|---|
| POST | `/api/auth/change-password` | Required | `{ currentPassword, newPassword }` | `200 { token, user }` | `400` invalid input, `401` wrong current password |
| POST | `/api/auth/forgot-password` | Public | `{ email }` | `202 { message }` | `400` invalid email |
| POST | `/api/auth/reset-password` | Public | `{ token, newPassword }` | `200 { message }` | `400` invalid input, or an invalid, expired or used token |

- `forgot-password` **always** returns the same `202` message ("If that email is registered, a reset link has been sent"), whether or not the account exists, so it can't be used to find out which emails are registered.
- `reset-password` uses one generic message for an invalid, expired or used token.
- After a reset, the user signs in normally with the new password.

### 6.1 Delivering the reset link

The link has the form `<FRONTEND_URL>/?reset_token=<token>`, where `FRONTEND_URL` is a new backend environment variable.

Delivery goes through a single `sendPasswordResetLink(user, link)` function, so a real email provider can be plugged in later without changing anything else:

- **Until an email provider is chosen:** the link is written to the server log, only when `NODE_ENV` is not `production`. In production, nothing is sent and a warning is logged.

### 6.2 Operator command

```bash
cd backend
npm run reset-link -- user@example.com
```

Creates a reset token for that user and prints the link (expires in 30 minutes). It uses the same code as `forgot-password` and needs `DATABASE_URL` and `FRONTEND_URL`. This is how user 1 is fixed: run it, open the link, set a password.

## 7. Frontend

- **Sign-in screen:** a "Forgot password?" link opens a form that asks for the email and then shows the generic "If that email is registered…" message.
- **Reset screen:** when the page opens with `?reset_token=…`, show a "Set a new password" form (new password and confirm). On success, remove the token from the address bar and return to sign-in with a success message.
- **Change password:** a **Change password** item next to **Log out** in the header opens a dialog (current, new, confirm) using the existing `Modal`. On success, save the new token and show a toast.
- No router is added. The reset screen is selected by the query parameter.

## 8. Swagger

- Add the three endpoints under the **Auth** tag, with request and response schemas and examples.
- Mark `change-password` with `bearerAuth`.
- Add a note to `info.description` explaining that during development, reset links appear in the backend console.

## 9. Configuration

| Variable | Required | Default |
|---|---|---|
| `FRONTEND_URL` | Yes for reset links | `http://localhost:5173` |

No new dependencies. `crypto` is built into Node.

## 10. Acceptance criteria

1. Change password with the right current password returns a new token. The old token then gets `401` and the new one works.
2. Change password with a wrong current password returns `401` and changes nothing.
3. `forgot-password` returns the identical `202` response for a registered and an unregistered email.
4. A reset link sets the new password once. Using the same link again, or a link older than 30 minutes, returns `400`.
5. After a reset, the old password fails, the new password works, and tokens issued before the reset get `401`.
6. A fourth reset request within an hour does not create a token, but the response is the same `202`.
7. `npm run reset-link -- <email>` prints a working link. User 1 can set a password with it and then sees their 11 customers.
8. The frontend forgot, reset and change flows work, and all three endpoints can be tested in Swagger.

## 11. Decisions

The user approved the spec with the recommended answers:

1. **No email provider in this spec.** Links are logged to the backend console outside production, and created with the operator command. Real email can be added later behind `sendPasswordResetLink`.
2. **User 1:** after implementation, create a reset link for user 1 with the operator command and give it to the user.
3. **Migration:** run `npm run migrate` as part of the implementation. If it's blocked, the user runs it.
