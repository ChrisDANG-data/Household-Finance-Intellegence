# Integrations Guide

## Overview

This project now supports:
- n8n automation workflows
- Plaid MCP balance sync into canonical Financial State
- LangGraph read-only orchestration for scenario chat

All canonical writes must remain inside `apps/web/services/financial-state/`.

## Document file storage (Vercel Blob)

Uploaded PDFs/images are stored in **object storage**; Postgres holds metadata, extracted text, and embeddings only.

| Env | Purpose |
|-----|---------|
| `STORAGE_PROVIDER` | `local` (default, dev) or `blob` (Vercel production) |
| `BLOB_READ_WRITE_TOKEN` | Required when `STORAGE_PROVIDER=blob` — from Vercel → Storage → Blob |

**Local dev:** omit or set `STORAGE_PROVIDER=local` — files go to `apps/web/.data/uploads/`.

**Vercel:**

1. Project → **Storage** → **Create Blob store** (links token automatically).
2. Set env: `STORAGE_PROVIDER=blob` and `BLOB_READ_WRITE_TOKEN` (auto-injected if created via Vercel UI).
3. Redeploy.

`Document.storagePath` stores either a local filesystem path or a private blob URL. Extraction reads from whichever was used at upload time.

**RAG embeddings (search chunks):**

| Environment | Provider | Env |
|-------------|----------|-----|
| Local dev (default) | Xenova all-MiniLM-L6-v2 (free, 384d) | none |
| Vercel / serverless | OpenAI `text-embedding-3-small` (384d) | `OPENAI_API_KEY` required on Vercel |

Optional: `EMBEDDING_PROVIDER=openai` or `local` to override.

## n8n

### Local startup

```bash
docker compose up -d postgres n8n
```

**Telegram:** n8n Cloud or self-hosted — daily startup in [`N8N_STARTUP.md`](./N8N_STARTUP.md); first-time local setup in [`N8N_TELEGRAM_LOCAL.md`](./N8N_TELEGRAM_LOCAL.md). Import workflow `automation/n8n/workflows/telegram-financial-qa.json`.

### Required env (apps/web/.env)

- `AUTOMATION_WEBHOOK_TOKEN` (Bearer token expected by automation routes)
- `N8N_CALLBACK_URL` (for workflow callbacks)
- `N8N_ENCRYPTION_KEY` (n8n secret at runtime)

### Workflow files

- `automation/n8n/workflows/daily-balance-sync-trigger.json`
- `automation/n8n/workflows/alert-on-risk-threshold.json`
- `automation/n8n/workflows/monthly-plaid-balance-snapshot.json`
- `automation/n8n/workflows/monthly-financial-summary-email.json`

### Telegram — add income / expense / investment

Use **`POST /api/automation/ledger-event`** (simpler than `/api/financial-state/events`).

| Field | Values |
|-------|--------|
| `kind` | `income`, `expense`, or `investment` |
| `category` | e.g. `salary`, `rent`, `rrsp` |
| `amount` | positive number |
| `frequency` | optional — `monthly` (default), `weekly`, `yearly`, `one_time`, … |
| `month` | optional — `May`, `2026-05`, `May 2026` → sets one-time + start date (1st of month) |
| `start_date` | optional — `YYYY-MM-DD` (defaults to today, or from `month`) |
| `owner` | optional — `partner_a` (default), `partner_b`, `joint` |
| `confirm` | optional — defaults to **`true`** (save). Set `false` for preview only |

**Telegram / n8n:** POST without `confirm` (or with `"confirm": true`). Reply to user with `data.reply` (e.g. “Saved: income salary $1,000.00 …”). Check `data.status === "saved"` in n8n — `"preview"` means nothing was written.

**Optional two-step flow:** `confirm: false` → user says yes → `confirm: true` (needs IF branch + static data in n8n).

**n8n tool:** `add_ledger_event` — POST `.../api/automation/ledger-event`

**Routing:** verbs **add / record / log / create** → `add_ledger_event`. Never Plaid tools for writes.

Bearer `Authorization` header when `AUTOMATION_WEBHOOK_TOKEN` is set.

### Telegram — financial Q&A (income, expenses, forecast)

Use **`POST /api/automation/financial-question`** — not `/api/scenario-chat`.

| Field | Required |
|-------|----------|
| `message` | User question (e.g. `what is the income in July`) |
| `user_id` | optional — default `default` |

**Response:** `{ reply, route }` inside `data`. Telegram must send **`data.reply` verbatim** to the user.

Why not `/api/scenario-chat`? The web route returns a full **timeline** (6+ months of JSON). The n8n agent often **recomputes** totals from that (e.g. `$52,000 = 5200×9 + …`) instead of using the deterministic answer. The automation route returns **text only**.

**n8n tool `ask_financial_question`:** POST `.../api/automation/financial-question`

**Agent system prompt (add):**

```text
For ledger lookups (income, expenses, totals by month, insurance, afford):
- Always call ask_financial_question.
- Reply with ONLY the tool's data.reply field — copy exactly, no math.
- Never sum or multiply amounts yourself.
```

### Monthly summary email (Gmail)

**New n8n workflow** (separate from Telegram): `monthly-financial-summary-email.json`

| Step | Node |
|------|------|
| 1 | Schedule Trigger — `0 8 1 * *` (8:00 UTC on the 1st → previous month summary) |
| 2 | HTTP GET `.../api/automation/monthly-summary?user_id=default` |
| 3 | Gmail Send — subject/body from `data.subject` and `data.body` |

**Query params:**

| Param | Default |
|-------|---------|
| `month` | previous UTC month (`YYYY-MM`) |
| `user_id` | `default` |

**Response:** `{ subject, body, label, month, summary }` — ready for Gmail.

**n8n variables:** `APP_API_BASE_URL`, `AUTOMATION_WEBHOOK_TOKEN`, `SUMMARY_EMAIL_TO`

Optional: `?month=2026-05` to test a specific month.

## Plaid

Official flow ([Plaid balance docs](https://plaid.com/docs/api/products/balance/)):

1. `POST /link/token/create` with products you need (e.g. `transactions`) — **do not** include `balance` in the products array.
2. Open **Plaid Link** on the client with the returned `link_token`.
3. `POST /item/public_token/exchange` with the Link `public_token` → `access_token`.
4. `POST /accounts/balance/get` with `access_token` → update `current_cash`.

### Env (`apps/web/.env`)

- `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=sandbox`
- `PLAID_REDIRECT_URI` — only if OAuth redirect is registered in the Plaid dashboard

### UI

- Ledger → **Bank connection (Plaid)** runs Link + exchange + balance sync.

### API routes

| Route | Purpose |
|-------|---------|
| `POST /api/integrations/plaid/link-token` | Step 1 — server-side `link/token/create` |
| `POST /api/integrations/plaid/exchange` | Step 3 — `public_token` → stored `access_token` (+ optional balance sync) |
| `POST /api/integrations/plaid/balances` | Step 4 — `accounts/balance/get` + `plaid_balance_history` rows |
| `GET /api/integrations/plaid/accounts?q=credit card` | Live per-account balances (credit card, checking, etc.) |
| `GET /api/integrations/plaid/history` | Chart series + recent snapshots (separate from forecast) |
| `POST /api/integrations/plaid/scheduled-sync` | End-of-month job — runs on last UTC day only; skips if month already synced (`force` to override) |
| `GET /api/integrations/plaid/status` | Linked `item_id` (never returns `access_token`) |
| `POST /api/integrations/plaid/sync` | Automation: direct balance if linked, else MCP fallback |

Access tokens are stored in `plaid_items` (server only).

### Balance history (`plaid_balance_history`)

Per account per sync: `balance`, `year`, `month`, `snapshot_date`, `account_name`, `balance_delta` (vs previous reading for that account).

**`financial_states.current_cash`** is updated from **checking accounts only** (Plaid `subtype: checking`). All linked accounts are still stored in `plaid_balance_history` for charts.

- UI: `/balances` — disposable assets summary + line chart (legend = account names) + table
- API: `GET /api/financial-state/disposable` — Plaid assets + ledger income − expenses − investments (current month); `POST` syncs Plaid first
- Manual: **Sync now** on `/balances` or **Refresh balances** after Link
- Scheduled: n8n `monthly-plaid-balance-snapshot.json` (cron `0 23 28-31 * *` UTC; API runs only on the **last UTC day** of the month) → `POST /api/integrations/plaid/scheduled-sync`

### n8n AI Agent — per-account balance questions

Use **`get_plaid_account_balances`** (not `ask_financial_question`) when the user asks about a **linked Plaid account** by name or type:

- “How much is on my credit card?”
- “Plaid credit card balance”
- “Checking account balance from the bank”

| Tool | Method | URL |
|------|--------|-----|
| `get_plaid_account_balances` | GET | `.../api/integrations/plaid/accounts?user_id=default&q=credit+card` |

Optional query `q` filters by account name/subtype (e.g. `credit`, `checking`, `savings`). Response: `data.accounts[]` with `account_name`, `subtype`, `balance`, `currency`.

**Routing rule for system prompt:** Plaid account / bank account balance → `get_plaid_account_balances`. Ledger payments, insurance, forecast → `ask_financial_question`. Total cash after sync → `get_financial_snapshot` or `sync_plaid_balances`.

### Balance sync (optional MCP fallback)

- `PLAID_MCP_BASE_URL` — separate MCP server (not `https://sandbox.plaid.com`)
- `PLAID_MCP_TOKEN` — bearer for that MCP server only

`POST /api/integrations/plaid/sync` (Bearer `AUTOMATION_WEBHOOK_TOKEN` when set) uses direct `/accounts/balance/get` when a item is linked; otherwise calls MCP `/balances`.

## LangGraph

### Production (Railway)

Deploy `services/langgraph-orchestrator` to [Railway](https://railway.app). Full steps: [services/langgraph-orchestrator/RAILWAY.md](../services/langgraph-orchestrator/RAILWAY.md).

| Where | Variables |
|-------|-----------|
| **Railway** | `APP_WEB_BASE_URL=https://household-financial-web.vercel.app` |
| **Vercel** | `LANGGRAPH_ENABLED=true`, `LANGGRAPH_URL=https://<railway-domain>` |

Vercel does **not** run the Python LangGraph service — only the Next.js app.

### Local startup

```bash
docker compose up -d langgraph
```

Or run directly from `services/langgraph-orchestrator/`.

### Required env (apps/web `.env` local)

- `LANGGRAPH_ENABLED=true`
- `LANGGRAPH_URL=http://localhost:8081`

### Integration

`apps/web/services/scenario-chat/orchestrator.ts` uses **hybrid routing**:

1. Deterministic ledger (month totals, category, partner) — TypeScript, no LLM
2. LangGraph multi-agent — complex / afford / what-if / forced `analyst_mode`
3. Ledger + RAG LLM — ambiguous document questions
4. Forecast advisor — default scenario flow

If LangGraph is unavailable, steps 2 falls through to 3–4.
