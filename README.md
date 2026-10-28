# Customer Hub

Two projects that run on separate ports:

| Project | Stack | Port |
|---|---|---|
| `backend/` | Node.js, Express, PostgreSQL (`pg`), Swagger UI, Anthropic SDK | 4000 |
| `frontend/` | React + Vite | 5173 |

The backend allows cross-origin requests (CORS). The frontend calls it over REST. No authentication is required.

## Backend

```bash
cd backend
npm install
# edit .env and set ANTHROPIC_API_KEY=sk-ant-...
npm run dev        # or: npm start
```

- Swagger UI: http://localhost:4000/swagger (raw spec at `/swagger.json`)
- Configuration is in `backend/.env`: `PORT`, `DATABASE_URL`, `CORS_ORIGIN` (comma-separated origins or `*`), `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-opus-5-5`)

### Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/customers` | All customers (`?name=ali` filters by partial name) |
| GET | `/api/customers/{id}` | One customer |
| POST | `/api/customers` | Create (`name` required; `email` and `phone` optional) |
| PUT | `/api/customers/{id}` | Update the fields you send |
| DELETE | `/api/customers/{id}` | Delete |
| POST | `/api/agent/chat` | Ask a question in natural language: `{ "message": "Get all customers", "history": [] }` |
| GET | `/api/health` | Health check, including the database connection |

### Agent

`POST /api/agent/chat` sends the question to Claude through the Anthropic SDK's tool runner. Claude can use these tools against the `customer` table:

`get_all_customers`, `get_customer_by_name`, `get_customer_by_id`, `add_customer`, `update_customer`, `delete_customer`

The response contains the reply and the tools that ran: `{ "reply": "...", "toolCalls": [{ "name": "get_all_customers", "input": {}, "ok": true }] }`.

## Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

The backend URL is set with `VITE_API_URL` in `frontend/.env` (default `http://localhost:4000`).

- **Layout**: top header bar with API status and a Swagger link, the full-width customer page, and a floating chat button in the bottom-right corner
- **Customers**: table with search, totals, and add, edit and delete dialogs
- **AI Assistant** (chat button): chat panel with suggested prompts. Answers render as Markdown and show which tools ran. The customer table refreshes when the assistant changes data. Closing the panel keeps the conversation.
