# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Customer Hub: two independent npm projects, each with its own `package.json`, `.env` and Vercel deployment.

- `backend/`: Express 5 REST API (ESM, plain JS) on PostgreSQL via `pg`, with JWT auth, Swagger UI and a Claude agent. Port 4000.
- `frontend/`: React 19 + Vite SPA. Port 5173. Talks to the backend over REST with a bearer token.

## Workflow: spec-driven development

This project follows spec-driven development:

1. **Spec:** write the spec for a feature or change in `_specs/` at the repo root, and get the user's approval before planning.
2. **Plan:** after the spec is approved, write the implementation plan in `_plans/`.
3. **Implement:** before starting implementation, make sure all changes on the current branch are committed (the working tree must be clean), then implement according to the plan.

Do not skip straight to implementation without an approved spec and a plan.

## Commands

```bash
# Backend
cd backend && npm install
npm run dev          # node --watch src/server.js
npm start
npm run migrate      # runs sql/*.sql in order (idempotent)
npm run reset-link -- user@example.com   # prints a password reset link

# Frontend
cd frontend && npm install
npm run dev          # Vite dev server
npm run build
npm run lint         # oxlint (config: frontend/.oxlintrc.json)
```

There is no test suite in either project, and the backend has no linter. To check the backend, hit `GET /api/health` (it also checks the DB connection) or use Swagger at `http://localhost:4000/swagger`.

## Configuration

- `backend/.env`: `PORT`, `DATABASE_URL`, `CORS_ORIGIN` (comma-separated or `*`), `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-opus-5-5`), `JWT_SECRET` (required for auth), `JWT_EXPIRES_IN` (default `8h`), `FRONTEND_URL` (base of password reset links). See `backend/.env.example`.
- `frontend/.env`: `VITE_API_URL` (default `http://localhost:4000`).
- The `pg` pool always uses SSL with `rejectUnauthorized: false` (the DB is hosted on Render), so a local non-SSL Postgres will fail unless `src/db.js` changes.
- The database is shared and was created outside this repo. It has `customer` (with `sales_user_id NOT NULL` → `app_user`, and a table-wide `UNIQUE (email)`), `app_user` (role `sales` or `admin`) and a `deal` table this app does not use yet. `sql/001_auth.sql` is an idempotent migration that matches the auth part of that schema; `sql/002_password_reset.sql` adds `app_user.token_version` and the `password_reset` table. Running migrations against the shared database is blocked for Claude by the auto-mode classifier, so ask the user to run `npm run migrate`.

## Backend architecture

- `src/customers.js` is the only data-access layer for customers: parameterized SQL functions that both the REST routes and the agent tools call. **Every function takes the owner's `userId` as its first argument and filters on `sales_user_id`**; that is where per-user access control is enforced. Another user's customer returns `null` (→ `404`), exactly like a missing one. Keep this rule for any new query.
- `src/auth.js` holds password hashing (bcryptjs), token signing and the `requireAuth` middleware, which sets `req.user = { user_id, email, role }`. Tokens carry `ver` = `app_user.token_version`; `requireAuth` checks it against the database on every request, and `users.setPassword` increments it, so any password change signs out all older tokens. `src/users.js` is the data access for `app_user`; only the `findUser*` functions return `password_hash`, and routes send users through `publicUser()` so `password_hash` and `token_version` never leave the server. `src/routes/auth.js` serves register, login and me. New users always get the database default role (`sales`); never take `role` from a request.
- `src/passwordResets.js` creates and consumes single-use reset tokens (only the SHA-256 hash is stored). `sendPasswordResetLink` is the one place a link leaves the server; it only logs outside production, and is where an email provider would plug in.
- `src/routes/customers.js` is the REST CRUD, and `src/routes/agent.js` is `POST /api/agent/chat`. The agent route validates and cleans `history` to plain `{role, content}` text turns, and maps Anthropic SDK errors to 429, 502 or 500 responses.
- `src/agent.js` runs one chat turn with `client.beta.messages.toolRunner` and Zod tools (`betaZodTool`). Tools are rebuilt on every request, bound to the logged-in user's id through a closure, and record which tools ran in `toolCalls` (`{name, input, ok}`), which is returned to the client. **Never add a user id to a tool's input schema**; the model must not be able to choose whose data it reads. Tool errors are returned to the model as JSON and are not thrown.
- `src/swagger.js` is a **hand-written** OpenAPI spec (`buildSpec()`). When you add or change an endpoint, update it by hand. It uses a relative server URL so "Try it out" works on the deployed host.
- `src/server.js` exports `app` for Vercel serverless and only calls `listen()` when `process.env.VERCEL` is unset. Keep it that way.

## Frontend architecture

- `src/api.js` is the single fetch wrapper. It adds the bearer token, turns non-2xx responses into `Error(data.error)` (so the backend should always return errors as `{ error: string }`), and calls the `onUnauthorized` callback on any `401` while logged in.
- `src/session.js` stores `{ token, user }` in `localStorage`. `App.jsx` shows `ResetPasswordView` when the URL has `?reset_token=`, otherwise `AuthView` when there is no session; `api.changePassword` passes `keepSessionOn401` because its 401 means a wrong current password, not an expired session; `CustomersView` and `ChatWidget` are keyed by `user_id`, so logging out or switching users resets their state.
- `App.jsx` owns the toasts, the API health status and a `refreshKey`. `ChatWidget` calls `onDataChanged` when a successful tool in its `MUTATING_TOOLS` set runs, which bumps `refreshKey` and makes `CustomersView` reload. **When you add a mutating agent tool on the backend, also add its name to `MUTATING_TOOLS` in `ChatWidget.jsx`.**
- The chat sends only earlier successful text turns back as `history`. The backend is stateless.
