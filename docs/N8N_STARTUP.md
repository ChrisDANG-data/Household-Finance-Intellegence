# n8n + Telegram — daily startup checklist

Use this each time you open the project and want **Telegram → n8n → FinIntel** working again.

**Related docs:** [`N8N_TELEGRAM_LOCAL.md`](./N8N_TELEGRAM_LOCAL.md) (first-time setup), [`N8N_EVAL_SETUP.md`](./N8N_EVAL_SETUP.md) (AI Agent + evals), [`INTEGRATIONS.md`](./INTEGRATIONS.md) (API routes + tools).

---

## Architecture (typical setup)

```text
Telegram user
    → n8n Cloud (always online — no local start)
    → HTTP tools → FinIntel API (local via ngrok OR Vercel)
    → Postgres (Docker, local dev)
    → reply back to Telegram
```

---

## Startup order (do this every session)

Order matters: **Postgres → app → ngrok (if needed) → n8n Cloud in browser**.

### Terminal 1 — Database (first)

From repo root:

```powershell
cd "c:\DLH\2026 Inference AI Course\Final_Project_AI"
docker compose up -d postgres
```

Postgres must be healthy before the app starts (~10 s).

> **n8n Cloud users:** You do **not** need `docker compose up -d n8n` unless you switched to local Docker n8n.

---

### Terminal 2 — Next.js app (second)

```powershell
cd "c:\DLH\2026 Inference AI Course\Final_Project_AI\apps\web"
npm run dev
```

Verify: http://127.0.0.1:3000/api/health → `"status":"ok"`

---

### Terminal 3 — ngrok (third, only if n8n tools hit your **local** app)

Skip this section if HTTP tools in n8n use **Vercel** (`https://household-financial-web.vercel.app`).

```powershell
ngrok http 3000
```

If `ngrok` is not on PATH (Windows):

```powershell
& "C:\Users\admin\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe" http 3000
```

Copy the **HTTPS** URL (e.g. `https://abc123.ngrok-free.dev`).

**Free ngrok URLs change when you restart ngrok.** Update every HTTP tool in n8n Cloud:

| Tool | URL pattern |
|------|-------------|
| `ask_financial_question` | `https://YOUR-NGROK-URL/api/automation/financial-question` |
| `add_ledger_event` | `https://YOUR-NGROK-URL/api/automation/ledger-event` |
| `get_plaid_account_balances` | `https://YOUR-NGROK-URL/api/integrations/plaid/accounts?user_id=default&q=...` |
| `sync_plaid_balances` | `https://YOUR-NGROK-URL/api/integrations/plaid/sync` |
| `get_financial_snapshot` | `https://YOUR-NGROK-URL/api/financial-state/state?user_id=default` |

Quick test in browser:

```text
https://YOUR-NGROK-URL/api/health
```

---

### Step 4 — n8n Cloud (browser)

1. Open your n8n Cloud instance (e.g. `https://automationai2026.app.n8n.cloud`).
2. Open workflow **Add ledger, Plaid Q&A** (or your Telegram workflow).
3. Confirm status is **Published** (green) — not only **Saved**.
4. No local n8n start required.

---

## Summary table

| Step | Command / action | Required? |
|------|------------------|-----------|
| 1 | `docker compose up -d postgres` | Yes (local DB) |
| 2 | `npm run dev` in `apps/web` | Yes (local API) |
| 3 | `ngrok http 3000` | Only if n8n tools use ngrok |
| 4 | n8n Cloud → workflow **Published** | Yes |

**Wrong order:** starting ngrok before Postgres/app — tunnel works but API calls fail until the app is up.

---

## Two API options (pick one)

| Option | n8n HTTP tool base URL | ngrok needed? | PC must stay on? |
|--------|------------------------|---------------|------------------|
| **A — Local dev** | `https://YOUR-NGROK-URL` | Yes — keep Terminal 3 open | Yes |
| **B — Vercel** | `https://household-financial-web.vercel.app` | No | No (for API; n8n Cloud is always on) |

Option **B** uses production Neon DB on Vercel, not necessarily your local Postgres. Option **A** uses whatever `DATABASE_URL` points to in `apps/web/.env` while `npm run dev` runs.

All automation routes need header `Authorization: Bearer <AUTOMATION_WEBHOOK_TOKEN>` when that token is set in Vercel / `apps/web/.env`.

---

## Local Docker n8n (alternative to Cloud)

If you run n8n in Docker instead of n8n Cloud, you need **two** tunnels (or Vercel for the app only):

| Tunnel | Port | Purpose |
|--------|------|---------|
| `ngrok http 127.0.0.1:5678` | n8n | Telegram webhooks (HTTPS required) |
| `ngrok http 3000` | app | FinIntel API (optional if using Vercel) |

After ngrok **5678** URL changes:

1. Update repo **root** `.env`:
   ```env
   N8N_WEBHOOK_URL=https://NEW-URL/
   ```
2. Recreate n8n:
   ```powershell
   docker compose up -d n8n --force-recreate
   ```
3. Open http://127.0.0.1:5678 → **Activate** workflow (toggle top-right).

See [`N8N_TELEGRAM_LOCAL.md`](./N8N_TELEGRAM_LOCAL.md) for first-time local n8n setup.

---

## Minimum checklist before testing Telegram

- [ ] `docker compose up -d postgres`
- [ ] `npm run dev` running (or Vercel deployed)
- [ ] ngrok running **if** tools point to ngrok
- [ ] n8n HTTP tool URLs match current ngrok URL (if using ngrok)
- [ ] Workflow **Published** on n8n Cloud (or **Active** on local n8n)
- [ ] Test message: `what is my house insurance in July`

---

## When you are done for the day

| Action | Effect |
|--------|--------|
| Stop ngrok (Ctrl+C) | n8n cannot reach local API until ngrok restarts |
| Stop `npm run dev` | Same |
| `docker compose stop postgres` | Optional; safe to leave running |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Connection error from n8n | App not running, wrong ngrok URL, or tools still point to old ngrok URL |
| `UNAUTHORIZED` on automation routes | Match `Authorization: Bearer …` in n8n Header Auth to `AUTOMATION_WEBHOOK_TOKEN` |
| Telegram silent | Workflow not **Published** / **Active**; or Cloud + local n8n both active on same bot |
| ngrok URL changed | Update all HTTP tool URLs in n8n; for local Docker n8n also update `N8N_WEBHOOK_URL` and recreate container |
| Wrong answers / agent asks for amount on lookups | Fix AI Agent system prompt — see [`N8N_EVAL_SETUP.md`](./N8N_EVAL_SETUP.md) routing section |
