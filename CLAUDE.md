# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Customer Hub: two independent npm projects, each with its own `package.json`, `.env` and Vercel deployment.

- `backend/`: Express 5 REST API (ESM, plain JS) on PostgreSQL via `pg`, with Swagger UI and a Claude agent. Port 4000.
- `frontend/`: React 19 + Vite SPA. Port 5173. Talks to the backend over REST, with no auth.

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

# Frontend
cd frontend && npm install
npm run dev          # Vite dev server
npm run build
npm run lint         # oxlint (config: frontend/.oxlintrc.json)
```

There is no test suite in either project, and the backend has no linter. To check the backend, hit `GET /api/health` (it also checks the DB connection) or use Swagger at `http://localhost:4000/swagger`.

## Configuration

- `backend/.env`: `PORT`, `DATABASE_URL`, `CORS_ORIGIN` (comma-separated or `*`), `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-opus-5-5`). See `backend/.env.example`.
- `frontend/.env`: `VITE_API_URL` (default `http://localhost:4000`).
- The `pg` pool always uses SSL with `rejectUnauthorized: false` (the DB is hosted on Render), so a local non-SSL Postgres will fail unless `src/db.js` changes.
- No migrations or schema files exist. The app expects an existing `customer` table with columns `customer_id, name, email, phone, created_at`.

## Backend architecture

- `src/customers.js` is the only data-access layer: parameterized SQL functions that both the REST routes and the agent tools call. Change queries here, not in the routes or the agent.
- `src/routes/customers.js` is the REST CRUD, and `src/routes/agent.js` is `POST /api/agent/chat`. The agent route validates and cleans `history` to plain `{role, content}` text turns, and maps Anthropic SDK errors to 429, 502 or 500 responses.
- `src/agent.js` runs one chat turn with `client.beta.messages.toolRunner` and Zod tools (`betaZodTool`). Tools are rebuilt on every request so each call records which tools ran in `toolCalls` (`{name, input, ok}`), which is returned to the client. Tool errors are returned to the model as JSON and are not thrown.
- `src/swagger.js` is a **hand-written** OpenAPI spec (`buildSpec()`). When you add or change an endpoint, update it by hand. It uses a relative server URL so "Try it out" works on the deployed host.
- `src/server.js` exports `app` for Vercel serverless and only calls `listen()` when `process.env.VERCEL` is unset. Keep it that way.

## Frontend architecture

- `src/api.js` is the single fetch wrapper. It turns non-2xx responses into `Error(data.error)`, so the backend should always return errors as `{ error: string }`.
- `App.jsx` owns the toasts, the API health status and a `refreshKey`. `ChatWidget` calls `onDataChanged` when a successful tool in its `MUTATING_TOOLS` set runs, which bumps `refreshKey` and makes `CustomersView` reload. **When you add a mutating agent tool on the backend, also add its name to `MUTATING_TOOLS` in `ChatWidget.jsx`.**
- The chat sends only earlier successful text turns back as `history`. The backend is stateless.
