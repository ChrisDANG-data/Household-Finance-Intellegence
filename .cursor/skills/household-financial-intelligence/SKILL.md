---
name: household-financial-intelligence
description: >-
  Engineering standards for the Household Financial Intelligence MVP — validation,
  Prisma integrity, API errors, deterministic forecasts, document/RAG, and AI
  boundaries. Use when implementing or reviewing features in apps/web, financial
  events, obligations, simulation, scenario chat, document extraction, or
  Prisma schema changes in this repo.
---

# Household Financial Intelligence — Engineering Skills

## Purpose

Build **reliable financial obligation ingestion** and **future affordability clarity**.

This is not a generic AI platform. Canonical truth lives in Postgres; math is deterministic; LLMs explain and retrieve — they do not invent balances or write ledger truth directly.

**North star:** *reliable obligation ingestion + affordability clarity.*

---

## Core principles

1. **Simplicity over abstraction** — smallest correct diff; no speculative helpers.
2. **Deterministic systems before AI** — forecasts, totals, and timelines from code, not LLM math.
3. **Database-first** — Prisma + PostgreSQL are canonical; `FinancialEvent` is authoritative for forecasts.
4. **Human review before automation** — obligation extraction may require confirmation; do not silently double-count.
5. **Stable data models before forecasting** — schema and `normalize.ts` before UI polish.
6. **Typed APIs everywhere** — shared types in `apps/web/types/` and `services/*/types.ts`.
7. **Financial correctness over feature quantity** — one correct month beats ten approximate features.

---

## MVP scope

### In scope (implemented or actively maintained)

| Area | Location | Notes |
|------|----------|-------|
| Document upload & text extraction | `services/document-intelligence/` | PDF, images; OCR fallback via Claude Vision |
| Obligation persistence | `FinancialObligation`, extraction API | Auto-extract after upload; dedupe vs events |
| Financial events (ledger) | `FinancialEvent`, `/ledger`, persistence | income, expenses, **investment** |
| Monthly summaries & 6-month forecast | `projection.ts`, `/simulation` | Rolling opening/closing balances |
| What-if scenarios | `/api/simulation/scenarios` | Deterministic adjustments |
| RAG + scenario Q&A | `rag.service.ts`, `scenario-chat/` | DB events first; document chunks second |
| AI explanations | `services/ai/advisor/`, chat UI | Narration only; no forecast math in prompts |

### Explicitly out of scope (do not add without product decision)

- Bank / Plaid integrations
- Autonomous agents or workflow orchestration
- LLM-computed balances or “AI forecasting”
- Mock financial data in production API paths
- Direct SQL schema edits bypassing Prisma migrations

---

## Skill 1 — Validation

**Goal:** Invalid financial data must not enter canonical storage.

### Validate at boundaries

- API request bodies (prefer **Zod** when adding new routes — see `docs/DEPENDENCIES.md`)
- Financial amounts, dates (`YYYY-MM-DD`), enums, frequencies
- Document metadata and extraction payloads

### Current patterns (until Zod is wired everywhere)

- **`normalizeFinancialEvents()`** in `services/financial-state/normalize.ts` — drops malformed rows; maps aliases; **`investment`** must stay in `VALID_TYPES`
- **`AppError`** with `code: "VALIDATION_ERROR"` and `statusCode: 400` from persistence layer
- **`parseDateOnly()`** for DB writes in `financial-state.persistence.ts`

### Rules

- Amounts ≥ 0 (zero allowed only when explicitly supported, e.g. unknown obligation)
- `frequency` ∈ `monthly | weekly | yearly | one_time`
- `type` ∈ `income | recurring_expense | one_time_expense | liability | asset | investment`
- Required fields must not be accidentally nullable in Prisma without intent
- Use **specific categories** (`house_insurance`, not generic `insurance`) for retrieval accuracy

---

## Skill 2 — Database integrity

**Goal:** One reliable financial truth.

### Requirements

- **Prisma** is the only write path to Postgres (`lib/prisma.ts`)
- Schema changes via **`prisma migrate dev`** or documented `db push` in dev only
- Never hand-edit production schema in SQL
- Relations stay normalized; obligations link `sourceDocumentId` when from uploads

### Key models

- **`FinancialEvent`** — canonical for forecasts (`eventDate`, `accountIn`, `accountOut` optional)
- **`FinancialObligation`** — extracted from documents; dedupe before sending to LLM
- **`FinancialState`** — `current_cash`, user scope
- **`Document` / `document_chunks`** — metadata, text, embeddings (pgvector)

### Deduplication rule

If an obligation matches an existing event (same `sourceDocumentId` or category keyword), **exclude it** from AI context to avoid double-counting. See `getFinancialContext()` in `scenario-chat/orchestrator.ts`.

---

## Skill 3 — Error handling

**Goal:** Predictable API behavior; no silent failures.

### All API routes

- Wrap handlers in **`withApiHandler()`** (`lib/api/route-handler.ts`)
- Return **`jsonSuccess(data)`** or **`jsonError(toAppError(err))`**
- Throw **`AppError`** for validation/not-found cases

### Standard response shapes

**Success:**

```json
{
  "success": true,
  "data": {}
}
```

**Error:**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message"
  }
}
```

### Common error codes

| Code | HTTP | When |
|------|------|------|
| `VALIDATION_ERROR` | 400 | Bad input, invalid dates/amounts |
| `NOT_FOUND` | 404 | Missing event, document, obligation |
| `NOT_IMPLEMENTED` | 501 | Scaffold route |
| `INTERNAL_ERROR` | 500 | Unexpected failure |

---

## Skill 4 — Deterministic forecast & simulation

**Goal:** Charts and totals match `projection.ts`, not LLM output.

### Source of truth

- **`projectMonth()`**, **`simulateForecast()`** — `services/financial-state/projection.ts`
- **`isExpenseEvent()`** includes `investment`
- Recurrence: `frequencyAppliesInMonth()` + `shouldListAsActiveEvent()` — `one_time` only in start month; `monthly`/`weekly` repeat

### Serialization for UI

- Include `opening_balance`, `closing_balance`, `income_by_category`, `expense_by_category`
- Forecast API: `POST /api/simulation/forecast` with `{ months, start_month? }`

### Rules

- Do not duplicate forecast math in React components or LLM prompts
- Rolling balance starts from `FinancialState.current_cash`
- Weekly amounts → monthly via `4.33` multiplier in projection layer only

---

## Skill 5 — AI & RAG boundaries

**Goal:** LLMs explain and retrieve; engines compute.

### Dependency direction

```
Document Intelligence → (validated ingest) → Financial State
Financial State → (read-only) → Forecast Simulation
Financial State + Documents + Forecast snapshots → AI Explanation
```

### Scenario chat flow (`scenario-chat/orchestrator.ts`)

1. **`tryDocumentAnswer()`** — query `FinancialEvent` + deduped obligations + RAG chunks
2. If document/DB context exists → Claude with **strict system prompt** (date filtering, no double-count)
3. Else → deterministic scenario simulation + advisor

### LLM output format (expense Q&A)

- One-line summary: `Total expenses in [month]: $X,XXX.XX`
- Bulleted lines with **fixed-width category column** and aligned `$` amounts (monospace in UI)
- Date filter: event active iff `start_date ≤ month end` AND (`end_date` null OR `end_date ≥ month start`)

### Do not

- Ask Claude to calculate forecasts from scratch when DB events exist
- Persist LLM output as `FinancialEvent` without validation/normalization
- Bypass `normalizeFinancialEvents()` for user-created events

---

## Skill 6 — UI & product conventions

- **Home / modules:** `components/layout/AppShell.tsx`, engine cards on `/`
- **Forecast + AI chat:** `/simulation` — Ask AI at top; results on `/simulation/chat-result`
- **Ledger:** `/ledger` — manual events + obligation list (no manual “add obligation” form)
- **Documents:** `/documents` — upload triggers extraction → obligations → events
- Prefer **`EngineModuleLayout`** for module pages; use `wide` for simulation/ledger/documents
- Minimize scope in PRs; match existing shadcn + Tailwind patterns in `components/ui/`

---

## Implementation checklist

Before merging financial features:

- [ ] Types updated in `services/financial-state/types.ts` and Prisma schema if persisted
- [ ] `normalize.ts` `VALID_TYPES` / aliases include any new event types
- [ ] API uses `withApiHandler` + `jsonSuccess` / `AppError`
- [ ] Forecast changes covered by `projection.ts` (not UI-only)
- [ ] AI context dedupes obligations vs events
- [ ] Category names specific enough for retrieval
- [ ] No secrets in commits; env via `apps/web/.env`

---

## Related docs

- Architecture (four engines): [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)
- Dependencies & Zod note: [docs/DEPENDENCIES.md](../../docs/DEPENDENCIES.md)
- Web app entry: [apps/web/README.md](../../apps/web/README.md)
