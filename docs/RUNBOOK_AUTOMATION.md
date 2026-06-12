# Automation Runbook

## Health checks

- n8n UI: `http://127.0.0.1:5678` (use this on Windows if `localhost` fails)
- LangGraph health: `GET http://localhost:8081/health`
- App health: `GET http://localhost:3000/api/health`

## Correlation IDs

- Every automation event should include `correlation_id`.
- Metadata is persisted in `automation_runs`.
- Plaid sync writes cursor + last correlation to `plaid_sync_cursors`.

## Common failures and actions

### Plaid MCP unreachable
- Symptom: `INTEGRATION_ERROR` in `/api/integrations/plaid/sync`
- Action:
  1. Verify `PLAID_MCP_BASE_URL`
  2. Verify token (`PLAID_MCP_TOKEN`)
  3. Retry from n8n workflow

### Automation webhook unauthorized
- Symptom: `UNAUTHORIZED` from `/api/automation/*`
- Action:
  1. Ensure n8n sends `Authorization: Bearer <AUTOMATION_WEBHOOK_TOKEN>`
  2. Confirm token matches `apps/web/.env`

### LangGraph unavailable
- Symptom: orchestrator not used; fallback answers still work
- Action:
  1. Check `LANGGRAPH_ENABLED=true`
  2. Check `LANGGRAPH_URL` and `/health`
  3. Restart `langgraph` service

## Safe modes

- Disable Plaid sync: disable n8n workflow `daily-balance-sync-trigger`
- Disable LangGraph quickly: set `LANGGRAPH_ENABLED=false`
- Keep product usable: scenario chat falls back to in-app orchestrator and manual ledger remains authoritative

## Deployment notes (cloud-hybrid)

- Run Next.js, n8n, and LangGraph as separate services.
- Keep Next.js as client ingress.
- Keep secrets in managed secret store, not in git.
- Alert on:
  - failed Plaid sync runs,
  - missing daily sync for > 24h,
  - LangGraph health failures.
