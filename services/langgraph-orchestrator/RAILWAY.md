# Deploy LangGraph to Railway

The orchestrator is a **separate Python service**. Vercel hosts only `apps/web`. Railway hosts this FastAPI app so production can use **Hybrid** LangGraph routing.

## Architecture

```text
User → Vercel (Next.js)
         ↓ POST /orchestrate
       Railway (LangGraph)
         ↓ read-only HTTP
       Vercel APIs (snapshot, ledger, Plaid)
```

## 1. Create Railway service

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Select this repository
3. **Settings → Source → Root Directory** → `services/langgraph-orchestrator`
4. Railway detects `Dockerfile` + `railway.toml` in that folder

### If build runs `npm run build` (wrong — that's the Next.js app)

The LangGraph service must **not** use Node build commands. In **Settings**:

| Setting | Correct value |
|---------|----------------|
| **Root Directory** | `services/langgraph-orchestrator` |
| **Watch paths** | `services/langgraph-orchestrator/**` (not `apps/web/**`) |
| **Build command** | *(empty — delete `npm run build --workspace=web`)* |
| **Start command** | *(empty — Dockerfile `CMD` starts uvicorn)* |
| **Builder** | Dockerfile (from `railway.toml`) |

Railway **Diagnose** may offer **“Fix watch patterns and commands”** — click that, then redeploy.

If `railway.toml` was ignored, watch paths were probably still pointing at `apps/web/**`.

## 2. Railway environment variables

| Variable | Value |
|----------|--------|
| `APP_WEB_BASE_URL` | `https://household-financial-web.vercel.app` (no trailing slash) |

Railway sets `PORT` automatically — do not override.

Optional (future auth between services):

| Variable | Value |
|----------|--------|
| `LANGGRAPH_SERVICE_TOKEN` | shared secret (not wired yet) |

## 3. Verify deploy

After deploy, open:

- `https://<your-railway-domain>/health` → `{"ok":true}`
- `https://<your-railway-domain>/` → service info JSON

Copy the public URL (e.g. `https://langgraph-orchestrator-production.up.railway.app`).

## 4. Point Vercel at Railway

In **Vercel → Project → Settings → Environment Variables** (Production):

```env
LANGGRAPH_ENABLED=true
LANGGRAPH_URL=https://<your-railway-domain>
LANGGRAPH_WRITER_ENABLED=true
```

Redeploy Vercel after saving.

## 5. Local dev (unchanged)

```bash
docker compose up -d langgraph
# or
APP_WEB_BASE_URL=http://localhost:3000 uvicorn app.main:app --port 8081
```

Local `apps/web/.env`:

```env
LANGGRAPH_ENABLED=true
LANGGRAPH_URL=http://localhost:8081
```

## 6. CLI deploy (optional)

```bash
npm i -g @railway/cli
cd services/langgraph-orchestrator
railway login
railway link
railway variables set APP_WEB_BASE_URL=https://household-financial-web.vercel.app
railway up
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Vercel still skips LangGraph | Check `LANGGRAPH_ENABLED` + `LANGGRAPH_URL` on Vercel; redeploy |
| Railway 502 on `/orchestrate` | Check logs; ensure `APP_WEB_BASE_URL` reaches live Vercel APIs |
| Snapshot fetch fails | Vercel DB/env must be healthy; test `POST /api/financial-state/snapshot` |
| Timeout | Railway cold start — retry; Vercel client timeout is 30s |

## Cost note

Railway free/credit tier is enough for course demos. Scale or sleep settings depend on your Railway plan.
