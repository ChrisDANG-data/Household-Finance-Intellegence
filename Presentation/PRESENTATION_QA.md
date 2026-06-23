# Presentation Q&A — 30 Questions & Answers

Use for rehearsal and the Q&A after your talk.

---

## Architecture & design

### 1. Why four separate engines instead of one big AI system?

**Answer:** Each engine has one job. Document Intelligence parses files; Financial State owns the ledger; Forecast Simulation does deterministic math; AI Explanation only narrates read-only snapshots. That prevents the LLM from inventing numbers or writing bad data. In finance, **trust comes from deterministic engines**, not a monolithic chatbot.

---

### 2. What is the most important AI boundary?

**Answer:** **AI never calculates money.** Totals, forecasts, and disposable assets come from code (`projection.ts`, Plaid sync, ledger queries). The LLM explains, retrieves document text, and routes questions — it does not own canonical truth.

---

### 3. How does Scenario Chat pick a path?

**Answer:** Hybrid routing in `scenario-chat/orchestrator.ts`: (1) deterministic ledger lookup for simple month/category questions → (2) LangGraph for complex multi-step questions → (3) RAG for document excerpts → (4) forecast + advisor for what-if affordability.

---

### 4. Why not let the LLM read the database directly?

**Answer:** That would skip validation, deduplication, and date filtering. All reads/writes go through Financial State services. The LLM only sees prepared snapshots and RAG chunks.

---

### 5. What is the difference between `FinancialEvent` and `FinancialObligation`?

**Answer:** **Events** are the canonical ledger (used for forecasts). **Obligations** are extracted from documents and shown for human review; confirming creates or links **events**. Obligations alone are not double-counted in AI context when a matching event exists.

---

## Plaid & balances

### 6. Why Plaid Direct API instead of Plaid MCP?

**Answer:** Decision in `Obsidian Vault/02_Decisions/2026-06-09_Plaid_Direct_API.md`: direct API in Next.js gives more control, easier debugging, fewer moving parts for MVP. MCP is an optional fallback for automation only.

---

### 7. How does Plaid sync work?

**Answer:** Link once (Plaid Link → store `access_token` in `plaid_items`). Sync calls `accounts/balance/get` via `plaid-direct-sync.service.ts`: updates `current_cash` from **checking only**, writes all accounts to `plaid_balance_history`. Manual sync on `/balances` or scheduled end-of-month via n8n.

---

### 8. What is disposable assets vs `current_cash`?

**Answer:** **`current_cash`** = Plaid checking only → forecast opening balance. **Disposable assets** = Plaid asset buckets (checking + savings + cash management + investments) + ledger income − expenses − investments for the current month → “what can we spend?” view on `/balances`.

---

## Documents, RAG & Obsidian

### 9. What is RAG and where does it run?

**Answer:** Retrieval-Augmented Generation: upload → chunk → embed in Postgres (`document_chunks` + pgvector) → at question time, retrieve similar chunks → Claude answers from excerpts only. Implemented in `rag.service.ts`.

---

### 10. What is Obsidian vs RAG?

**Answer:** **Obsidian** = your personal markdown wiki (human reading, links, learning notes). **RAG** = vector search for the **app’s AI** at runtime. Same upload can feed both: RAG for Q&A, Obsidian export for visualization. See `Obsidian Vault/02_Decisions/2026-06-12_RAG_and_Household_Wiki.md`.

---

### 11. Where are PDF files stored?

**Answer:** Local dev: `apps/web/.data/uploads/`. Production: **Vercel Blob** when `STORAGE_PROVIDER=blob`. Postgres holds metadata, extracted text, and embeddings — not the binary file in the DB row.

---

## Telegram, n8n & ngrok

### 12. Why Telegram → ngrok → n8n?

**Answer:** Telegram needs a **public HTTPS webhook**. n8n runs on **localhost:5678** (Docker), which Telegram cannot reach. **ngrok** tunnels HTTPS to local n8n during development. n8n then calls your **Vercel API** (`/api/automation/financial-question`) and replies in Telegram. See `docs/N8N_TELEGRAM_LOCAL.md`.

---

### 13. Why not Telegram → Vercel directly?

**Answer:** You could add a webhook route in Next.js. This project uses **n8n** for Telegram trigger/reply nodes, multiple workflows (Q&A, ledger add, Plaid cron, email), and eval — without maintaining a custom bot server.

---

### 14. What happens when ngrok URL changes?

**Answer:** Update `N8N_HOST`, `N8N_WEBHOOK_URL` in root `.env`, restart n8n (`docker compose up -d n8n --force-recreate`), re-activate the workflow. Production fix: deploy n8n on Railway with a stable URL.

---

## Demo questions

### 15. Can my family afford $20K travel to China in July?

**Answer:** Scenario Chat → intent `affordability_check` → add one-time $20K expense in July → `simulateForecast` from `current_cash` + ledger events → show closing balance and risk. AI explains; numbers come from the engine.

---

### 16. Do I have enough cash for the 2nd property tax installment in June?

**Answer:** Property tax must be in the ledger (from uploaded bill or manual event). App sums June property tax from events and compares to disposable assets or June forecast closing cash.

---

### 17. What is income in July?

**Answer:** Deterministic `projectMonth("2026-07")` on ledger events — no LLM required for simple totals. Example expected answer: ~$8,200 (your sandbox ledger).

---

## Deployment & infra

### 18. What runs where?

**Answer:** **Vercel** — Next.js app. **Neon** — PostgreSQL + pgvector. **Vercel Blob** — files. **Local Docker** — Postgres (dev), n8n. **Railway** (optional) — LangGraph, n8n prod. **Plaid** — sandbox API.

---

### 19. What triggers a Vercel deploy?

**Answer:** Push/merge to `main` on GitHub triggers Vercel build. n8n and Docker changes do **not** auto-deploy — manual on your machine.

---

### 20. Is there CI?

**Answer:** GitHub Actions on `main` (from project setup). Vercel handles production deploys. Local: `npm test` in `apps/web`.

---

## Database & Prisma (21–30)

### 21. How does data get from PostgreSQL to the UI?

**Answer:** `schema.prisma` → `prisma generate` → `@prisma/client` → `lib/prisma.ts` → services (e.g. `financial-state.persistence.ts`) → API routes → React components fetch or server components load data.

---

### 22. What is `schema.prisma`?

**Answer:** The blueprint for tables (`FinancialEvent`, `Document`, `plaid_items`, etc.). Prisma generates TypeScript types and query methods from it.

---

### 23. Where is `prisma.financialEvent.findMany()` used?

**Answer:** Financial state persistence, scenario chat orchestrator, wiki compile service — anywhere the app needs the canonical event list for projections or Q&A.

---

### 24. What is `@/lib/prisma.ts`?

**Answer:** Singleton Prisma client — one connection pool in dev (avoids “too many connections” on hot reload).

---

### 25. Server page vs client fetch?

**Answer:** Server components can call services directly (e.g. ledger page). Client components use `fetch` to `/api/...` (e.g. `/balances` disposable card). Both ultimately hit the same services.

---

### 26. What is stored vs computed?

**Answer:** **Stored:** `FinancialEvent` rows, `current_cash`, Plaid history. **Computed:** monthly totals, 6-month forecast, disposable assets, risk — from `projection.ts` and sync services, not saved as LLM output.

---

### 27. Local vs production database?

**Answer:** Local: Docker Postgres or Neon branch. Production: Neon URL in Vercel env. Same Prisma schema; `DATABASE_URL` switches the target.

---

### 28. When do I run `prisma generate`?

**Answer:** After changing `schema.prisma`. Also runs on `npm install` postinstall in many setups. Without it, TypeScript types drift from the DB.

---

### 29. What are scoped packages like `@prisma/client`?

**Answer:** npm packages under an org scope — `@/` in imports is a **path alias** to `apps/web/` (different concept). `@prisma/client` is the generated DB client package.

---

### 30. Why Prisma instead of raw SQL?

**Answer:** Type-safe queries, migrations, and one pattern for the whole team. pgvector chunks may still use raw SQL where needed; canonical writes stay in services.

---

## Bonus rapid-fire

| Question | One-line answer |
|----------|-----------------|
| Who owns the ledger? | Financial State engine + Postgres |
| Can AI add a ledger row? | Only via validated API (`ledger-event`, document confirm) |
| Plaid MCP? | Optional fallback; Direct API is primary |
| ngrok in prod? | No — use Railway n8n with stable URL |
| Obsidian in prod UI? | No — developer/household wiki sidecar |
