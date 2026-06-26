# Telegram + n8n (self-hosted, free)

Use this when **n8n Cloud trial ended**. Your Vercel app stays the same; only n8n runs locally (or on Railway).

> **Daily startup (Postgres → app → ngrok → n8n):** see [`N8N_STARTUP.md`](./N8N_STARTUP.md).

## Architecture

```
Telegram user
    → n8n (local + public tunnel)
    → POST https://household-financial-web.vercel.app/api/automation/...
    → reply back to Telegram
```

**Email:** n8n login email can differ from GitHub/Vercel/Railway.

---

## Step 1 — Start n8n locally

From repo root:

```powershell
cd "c:\DLH\2026 Inference AI Course\Final_Project_AI"
docker compose up -d n8n
```

Open **http://127.0.0.1:5678** → create admin account (any email).

> **Windows:** If `http://localhost:5678` fails or spins forever, use **`http://127.0.0.1:5678`** instead (`localhost` can hit IPv6 and fail with Docker).

---

## Step 2 — Public URL for Telegram (required)

Telegram cannot reach `localhost`. Use a tunnel while testing:

### Option A — ngrok (easiest)

1. Install [ngrok](https://ngrok.com/) and sign in.
2. In a **second terminal**:

```powershell
# Use 127.0.0.1 — NOT bare 5678 (ngrok defaults to localhost, which fails on Windows + Docker)
ngrok http 127.0.0.1:5678
```

3. Copy the **HTTPS** URL, e.g. `https://abc123.ngrok-free.app`

4. Add **ngrok-only** vars to repo **root** `.env` (next to `docker-compose.yml`):

```env
# Docker / n8n only — ngrok URL changes when you restart ngrok
N8N_HOST=abc123.ngrok-free.app
N8N_PROTOCOL=https
N8N_WEBHOOK_URL=https://abc123.ngrok-free.app/
N8N_ENCRYPTION_KEY=pick-one-stable-secret-and-keep-it
```

**Keep shared secrets in `apps/web/.env`** (already there):
- `AUTOMATION_WEBHOOK_TOKEN` — n8n Docker now loads this via `env_file`
- Optional: `APP_API_BASE_URL=https://household-financial-web.vercel.app` (or n8n defaults to Vercel URL)

Docker Compose **does not** read `apps/web/.env` for `${N8N_HOST}` substitution — only **root** `.env` is used for those three ngrok lines. You do **not** need to duplicate the Bearer token.

5. Restart n8n:

```powershell
docker compose up -d n8n --force-recreate
```

**Note:** Free ngrok URL changes each run — update `.env` and restart n8n when it changes.

### Option B — n8n on Railway (always-on URL)

Deploy n8n as its own Railway service if you want a stable URL without ngrok. Same env vars as above.

---

## Step 3 — Credentials in n8n

In n8n UI → **Credentials**:

| Credential | Used for |
|------------|----------|
| **Telegram API** | Bot token from [@BotFather](https://t.me/BotFather) |
| **Header Auth** (or Generic Credential) | `Authorization: Bearer <AUTOMATION_WEBHOOK_TOKEN>` |

Header Auth setup:
- Name: `Authorization`
- Value: `Bearer YOUR_TOKEN` (match Vercel `AUTOMATION_WEBHOOK_TOKEN`)

---

## Step 4 — Import workflow

1. n8n → **Workflows** → **Import from file**
2. Select `automation/n8n/workflows/telegram-financial-qa.json`
3. Open each node → re-select **Telegram** and **Header Auth** credentials
4. **Activate** workflow (toggle top-right)

This workflow is **simple (no AI agent)** — every message goes to `/api/automation/financial-question` and returns `data.reply` verbatim. Reliable for “income in July” tests.

To rebuild the full **AI Agent** (`add_ledger_event`, Plaid, voice): see `docs/N8N_EVAL_SETUP.md`.

---

## Step 5 — Telegram webhook

After **Activate**, n8n registers the webhook with Telegram automatically.

Test in Telegram: send **what is the income in July**

**Pass:** ~**$8,200** (not $51,800).

---

## Step 6 — n8n variables (optional, for AI agent workflows)

**Settings → Variables:**

| Variable | Value |
|----------|--------|
| `APP_API_BASE_URL` | `https://household-financial-web.vercel.app` |
| `AUTOMATION_WEBHOOK_TOKEN` | same as Vercel |

(Docker also passes these from `.env` if set.)

---

## Google Sheets OAuth (Windows fix)

After Google sign-in, if the browser shows **ERR_CONNECTION_RESET**, Google sent you to `localhost:5678` which fails on Windows.

1. **Google Cloud Console** → Credentials → your OAuth client → add redirect URI:
   ```text
   http://127.0.0.1:5678/rest/oauth2-credential/callback
   ```
2. Restart n8n (uses `N8N_EDITOR_BASE_URL=http://127.0.0.1:5678/`):
   ```powershell
   docker compose up -d n8n --force-recreate
   ```
3. Open n8n only at **http://127.0.0.1:5678** (not localhost)
4. Credentials → Google Sheets → OAuth redirect should show **127.0.0.1**
5. **Connect** again → Advanced → Allow

**Note:** ngrok is for Telegram webhooks only; Google OAuth always uses **127.0.0.1:5678** in your browser.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| **? icons** on AI Agent / Gemini / Evaluation nodes | Local n8n was **too old** (1.70). Run `docker compose pull n8n && docker compose up -d n8n --force-recreate` |
| **ERR_CONNECTION_RESET** after Google OAuth | Google redirected to `localhost:5678` — use **127.0.0.1** redirect URI (see below) |
| `UNAUTHORIZED` | Token in Header Auth = Vercel `AUTOMATION_WEBHOOK_TOKEN` |
| Wrong dollar amount | Use `/api/automation/financial-question`, not scenario-chat |
| Webhook not set | Restart n8n after changing `N8N_WEBHOOK_URL` |
| **Eval works, Telegram silent** | ngrok likely forwards to `localhost:5678` (broken on Windows). Stop ngrok → `ngrok http 127.0.0.1:5678` → confirm https URL returns 200 at `/healthz` → re-activate workflow |
| ngrok URL changed | Update `.env` → `docker compose up -d n8n --force-recreate` → re-activate workflow |

---

## Quick checklist (first-time setup)

- [ ] `docker compose up -d n8n`
- [ ] ngrok HTTPS URL in `.env` + n8n recreated
- [ ] Telegram bot credential in n8n
- [ ] Header Auth credential (Bearer token)
- [ ] Import + activate `telegram-financial-qa.json`
- [ ] Test message in Telegram

**Every session after that:** [`N8N_STARTUP.md`](./N8N_STARTUP.md).
