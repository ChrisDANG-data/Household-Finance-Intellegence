# Integrations Guide

## Overview

This project now supports:
- n8n automation workflows
- Plaid MCP balance sync into canonical Financial State
- LangGraph read-only orchestration for scenario chat

All canonical writes must remain inside `apps/web/services/financial-state/`.

## n8n

### Local startup

```bash
docker compose up -d postgres n8n
```

### Required env (apps/web/.env)

- `AUTOMATION_WEBHOOK_TOKEN` (Bearer token expected by automation routes)
- `N8N_CALLBACK_URL` (for workflow callbacks)
- `N8N_ENCRYPTION_KEY` (n8n secret at runtime)

### Workflow files

- `automation/n8n/workflows/daily-balance-sync-trigger.json`
- `automation/n8n/workflows/alert-on-risk-threshold.json`

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
| `POST /api/integrations/plaid/scheduled-sync` | Monthly job — skips if UTC month already synced (`force` to override) |
| `GET /api/integrations/plaid/status` | Linked `item_id` (never returns `access_token`) |
| `POST /api/integrations/plaid/sync` | Automation: direct balance if linked, else MCP fallback |

Access tokens are stored in `plaid_items` (server only).

### Balance history (`plaid_balance_history`)

Per account per sync: `balance`, `year`, `month`, `snapshot_date`, `account_name`, `balance_delta` (vs previous reading for that account).

- UI: `/balances` — line chart (legend = account names) + table
- Manual: **Sync now** on `/balances` or **Refresh balances** after Link
- Scheduled: n8n `monthly-plaid-balance-snapshot.json` (cron `0 8 1 * *` UTC) → `POST /api/integrations/plaid/scheduled-sync`

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

### Local startup

```bash
docker compose up -d langgraph
```

Or run directly from `services/langgraph-orchestrator/`.

### Required env (apps/web/.env)

- `LANGGRAPH_ENABLED=true`
- `LANGGRAPH_URL=http://localhost:8081`

### Integration

`apps/web/services/scenario-chat/orchestrator.ts` calls LangGraph first (when enabled). If unavailable, it falls back to existing in-app orchestrator.
