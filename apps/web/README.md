# Web application (`apps/web`)

Next.js App Router app for **Household Financial Intelligence**.

## Docs

- [Root setup & development](../../README.md#setup--development)
- [Architecture](../../docs/ARCHITECTURE.md)
- [Dependencies](../../docs/DEPENDENCIES.md)
- [Engineering skill (agent standards)](../../.cursor/skills/household-financial-intelligence/SKILL.md)
- [Environment variables](./.env.example)

## Quick start

```bash
cp .env.example .env
# From repo root: docker compose up -d
# DATABASE_URL is pre-filled for local Docker in .env.example

npm install
npx prisma db push
npm run dev
```

## MVP features

| Page | URL | What it does |
|------|-----|----------------|
| Documents | `/documents` | Upload PDF/images; extract and store raw text in Postgres |
| Ledger | `/ledger` | Create, edit, delete obligations; monthly total summary |

**APIs:** `POST/GET /api/documents/upload`, `GET/PATCH/DELETE /api/obligations`, `GET /api/financial-state/ledger`

**Canonical financial model (Postgres):**

| Table | Persists |
|-------|----------|
| `financial_states` | `user_id`, `current_cash`, `monthly_income` |
| `financial_events` | Full `FinancialEvent` rows (metadata as JSON) |

`FinancialState.computed` and `FinancialTimelineState` are **derived at read time** (projection engine), never stored.

| API | Purpose |
|-----|---------|
| `GET/PUT /api/financial-state/state` | Load state (+ optional `?timeline=true`) / update scalars |
| `GET/POST /api/financial-state/events` | List / create events |
| `GET/PATCH/DELETE /api/financial-state/events/[id]` | Event CRUD |
| `POST /api/financial-state/snapshot` | Pass `{ "use_persisted": true }` for DB-backed snapshot |

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server (Turbopack) |
| `npm run build` | `prisma generate` + production build |
| `npm run db:migrate` | Prisma migrate dev |
| `npm run db:studio` | Prisma Studio |

## Import alias

`@/*` → project root (e.g. `@/services/financial-state`, `@/types/financial-state`).
