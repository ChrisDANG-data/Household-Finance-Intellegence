# Household Financial Intelligence — Jira Backlog

Use this as a copy-paste source when creating issues in Jira (or import via CSV — see bottom).

**Suggested Jira project key:** `HFI`  
**Suggested board:** Scrum or Kanban  
**Labels:** `mvp`, `automation`, `ledger`, `data-quality`, `vercel`, `railway`, `n8n`

---

## Epics

| Epic | Summary | Goal |
|------|---------|------|
| HFI-E1 | Telegram / n8n automation | Reliable financial Q&A via Telegram |
| HFI-E2 | Forecast & deterministic ledger | Correct month totals from Postgres events |
| HFI-E3 | Data quality & validation | Block bad input; cleanse duplicates |
| HFI-E4 | Document ingestion & RAG | Upload → extract → review → ledger |
| HFI-E5 | LangGraph multi-agent routing | Railway orchestrator for complex questions |
| HFI-E6 | Obsidian / project documentation | Engineering vault + household wiki |
| HFI-E7 | Deploy & operations | Vercel, Railway, env vars, smoke tests |

---

## Stories & tasks (by epic)

### HFI-E1 — Telegram / n8n automation

| ID | Type | Summary | Status | Acceptance criteria |
|----|------|---------|--------|---------------------|
| HFI-101 | Story | n8n HTTP tool calls financial-question API | Done | Tool URL is `POST /api/automation/financial-question` (not scenario-chat) |
| HFI-102 | Task | Configure Bearer auth in n8n | Done | Header `Authorization: Bearer <AUTOMATION_WEBHOOK_TOKEN>`; `APP_API_BASE_URL` set |
| HFI-103 | Task | Agent returns `data.reply` verbatim | To Do | Telegram shows exact API reply; agent system prompt forbids recomputing totals |
| HFI-104 | Task | Smoke test July income via Telegram | Blocked | After HFI-201 deploy: “income in July” → ~$8,200 not $51,800 |
| HFI-105 | Bug | Telegram showed $51,800 for July income | Root cause found | API returned wrong total due to duplicate DB rows (not agent math) |

**Test plan (HFI-104):**
```powershell
$body = '{"message":"what is the income in July"}'
Invoke-RestMethod -Uri "https://household-financial-web.vercel.app/api/automation/financial-question" `
  -Method POST -Headers @{Authorization="Bearer <TOKEN>"; "Content-Type"="application/json"} -Body $body
```
Expect: `data.route` = `deterministic_ledger`, `data.reply` contains `$8,200.00`.

---

### HFI-E2 — Forecast & deterministic ledger

| ID | Type | Summary | Status | Acceptance criteria |
|----|------|---------|--------|---------------------|
| HFI-201 | Story | Dedupe events on read for projections | Done (local) | `loadState` applies `dedupeFinancialEventsForProjection`; July income = $8,200 |
| HFI-202 | Task | Deploy dedupe fix to Vercel | To Do | Production API matches local after deploy |
| HFI-203 | Task | Clean duplicate salary rows in Ledger UI | To Do | Neon has 13 income rows → 3 logical streams; user deletes extras manually |
| HFI-204 | Story | Deterministic month lookup for Q&A | Done | `tryDeterministicMonthAnswer` routes “income in July” without LLM |

**Key files:** `event-dedupe.ts`, `financial-state.persistence.ts`, `monthly-lookup.ts`

---

### HFI-E3 — Data quality & validation

| ID | Type | Summary | Status | Acceptance criteria |
|----|------|---------|--------|---------------------|
| HFI-301 | Story | Shared amount validator | Done (local) | `validateFinancialAmount`: min $0.01, max $1M, rejects negative/NaN |
| HFI-302 | Story | Write-time duplicate blocking | Done (local) | Create/update event rejects exact + recurring stream duplicates (400) |
| HFI-303 | Task | Document confirm skips invalid amounts | Done (local) | Extraction confirm filters amounts > max or ≤ 0 |
| HFI-304 | Task | Deploy validation to Vercel | To Do | POST negative amount → 400; duplicate salary → 400 |
| HFI-305 | Story | Data quality report / admin view | Backlog | List outliers, duplicates, zero-amount rows |
| HFI-306 | Story | UI outlier warning (> $50k) | Backlog | Confirm dialog before save on large amounts |
| HFI-307 | Task | Zod schemas on financial-state APIs | Backlog | Per engineering skill — validate all request bodies |

**Key files:** `amount-validation.ts`, `financial-state.persistence.ts`, `obligation.service.ts`

**Unit tests:** `amount-validation.test.ts`, `event-dedupe.test.ts` (11 tests)

---

### HFI-E4 — Document ingestion & RAG

| ID | Type | Summary | Status | Acceptance criteria |
|----|------|---------|--------|---------------------|
| HFI-401 | Story | Upload → extract → review → confirm | Done | Two-step flow in `POST /api/documents/extraction` |
| HFI-402 | Task | `replaceExisting: true` on re-confirm | Done | Re-upload replaces events tied to same `sourceDocumentId` |
| HFI-403 | Bug | Re-upload created duplicate salary rows | Mitigated | HFI-201 read dedupe + HFI-302 write block |
| HFI-404 | Task | Human review before automation | Done | ObligationReviewDialog required before ledger write |

---

### HFI-E5 — LangGraph multi-agent routing

| ID | Type | Summary | Status | Acceptance criteria |
|----|------|---------|--------|---------------------|
| HFI-501 | Story | LangGraph service on Railway | Done | `services/langgraph-orchestrator`, Dockerfile, `railway.toml` |
| HFI-502 | Task | Vercel env: `LANGGRAPH_ENABLED`, `LANGGRAPH_URL` | To Do | Simple ledger questions skip LangGraph; complex use hybrid |
| HFI-503 | Task | Remove Hybrid/Direct UI toggle | Done | Server-side routing only |
| HFI-504 | Task | Health check LangGraph on Railway | To Do | `LANGGRAPH_URL` responds; forecast complex question works |

---

### HFI-E6 — Obsidian / documentation

| ID | Type | Summary | Status | Acceptance criteria |
|----|------|---------|--------|---------------------|
| HFI-601 | Story | Household wiki from uploads | Done | `services/wiki/`, sync on upload, ObsidianWikiPanel |
| HFI-602 | Story | Engineering vault sync | Done | `npm run sync:obsidian`, folders `00_Dashboard` … `10_Logs` |
| HFI-603 | Task | `OBSIDIAN_VAULT_PATH` in `.env` | Done | Points to local Obsidian vault |

---

### HFI-E7 — Deploy & operations

| ID | Type | Summary | Status | Acceptance criteria |
|----|------|---------|--------|---------------------|
| HFI-701 | Task | Commit & push data-quality + dedupe changes | To Do | All modified files in git; CI green |
| HFI-702 | Task | Deploy apps/web to Vercel | To Do | Production reflects latest main |
| HFI-703 | Task | Align `AUTOMATION_WEBHOOK_TOKEN` (Vercel = n8n) | Done | curl auth returns 200 not 401 |
| HFI-704 | Task | Update `docs/INTEGRATIONS.md` / `N8N_EVAL_SETUP.md` | Done | financial-question URL documented |
| HFI-705 | Task | Post-deploy regression checklist | To Do | Forecast July, Telegram July, ledger create duplicate blocked |

---

## Recommended sprint order

### Sprint 1 — Fix July income (ship)
1. HFI-701 Commit & push  
2. HFI-702 Deploy Vercel  
3. HFI-202 Verify production API  
4. HFI-103 n8n agent uses `data.reply` only  
5. HFI-104 Telegram smoke test  
6. HFI-203 Optional ledger cleanup  

### Sprint 2 — Harden data quality
1. HFI-304 Deploy validation (same deploy as Sprint 1 if bundled)  
2. HFI-305 Data quality report (if time)  
3. HFI-306 UI outlier warning  

### Sprint 3 — Platform & course deliverables
1. HFI-502 / HFI-504 LangGraph production check  
2. HFI-307 Zod on APIs  
3. Jira ↔ git: link PRs in ticket descriptions  

---

## Jira setup (5 minutes)

1. **Create project** → Software → Scrum → name: *Household Financial Intelligence*  
2. **Create epics** HFI-E1 … HFI-E7 (copy summaries from table above)  
3. **Create issues** — paste Summary + Description + Acceptance criteria from tables  
4. **Labels** — add `mvp`, `data-quality`, `automation`, etc.  
5. **Link commits** — in PR description: `HFI-201 Fixes duplicate projection totals`  

### Issue description template

```
**Context**
<why this matters>

**Acceptance criteria**
- [ ] …
- [ ] …

**Test plan**
<curl / UI steps>

**Key files**
- apps/web/…
```

---

## CSV bulk import (link to existing epics)

**File:** [JIRA_BACKLOG.csv](./JIRA_BACKLOG.csv) — **32 issues only** (no epic rows — you already created them)

### Your epic keys (do not re-import)

| Jira key | Epic summary |
|----------|----------------|
| **KAN-4** | Telegram / n8n automation |
| **KAN-5** | Forecast & deterministic ledger |
| **KAN-6** | Data quality & validation |
| **KAN-7** | Document ingestion & RAG |
| **KAN-8** | LangGraph multi-agent routing |
| **KAN-9** | Obsidian / project documentation |
| **KAN-10** | Deploy & operations |

The CSV **`Parent`** column uses these keys so each Story/Task/Bug links to your epics.

### Steps (Jira Cloud Kanban)

1. Open **HFI/KAN** project → **⋯** → **Import issues**.
2. Upload `docs/JIRA_BACKLOG.csv`.
3. Map columns (**required for Parent linking**):

   | CSV column | Jira field |
   |------------|------------|
   | **Work item id** | **Work item ID** |
   | **Issue Type** | **Issue Type** |
   | **Parent id** | **Parent** (or Parent ID) |
   | Summary | Summary |
   | Description | Description |
   | Priority | Priority |
   | Labels | Labels |
   | Status | Status |

   If you see **“Map work item ID to proceed”**, you must map **Work item id** → **Work item ID** before import will continue.

4. **Parent id** values are your existing epic keys: `KAN-4` … `KAN-10`.

### If Parent column fails

Import without Parent, then bulk-edit in Jira:
- Select imported issues → **⋯** → **Bulk change** → set **Parent** to KAN-4 … KAN-10 using the `Ref: HFI-xxx | Epic: KAN-x` line in each description.

### Reference IDs

Descriptions include `Ref: HFI-101` and `Epic: KAN-4` for traceability. Jira will assign new keys (e.g. KAN-11+).

---

## CSV import (manual / legacy)

Create a CSV with columns: `Summary, Issue Type, Description, Epic Link, Labels, Priority`

Example rows:

```csv
Summary,Issue Type,Description,Labels,Priority
Deploy dedupe fix to Vercel,Task,"Deploy apps/web so production July income returns ~8200. AC: automation API reply matches local.",vercel;ledger,High
Configure n8n agent to echo data.reply,Task,"System prompt: return tool data.reply verbatim; no math on timeline.",automation;n8n,High
Shared amount validator,Story,"validateFinancialAmount min 0.01 max 1M reject negative. AC: 11 unit tests pass.",data-quality,Medium
Data quality dashboard,Story,"Admin view: duplicates outliers zero rows.",data-quality,Low
```

In Jira: **Settings → System → External system import → CSV**

---

## Traceability matrix (course / demo)

| Requirement | Jira | Evidence |
|-------------|------|----------|
| Deterministic forecasts | HFI-E2, HFI-201 | `projection.ts`, `monthly-lookup.ts` |
| No LLM math for ledger lookups | HFI-101, HFI-104 | `/api/automation/financial-question` |
| Data validation at boundaries | HFI-E3, HFI-301 | `amount-validation.ts` |
| Human review before automation | HFI-404 | ObligationReviewDialog |
| Duplicate prevention | HFI-302, HFI-201 | `event-dedupe.ts` |
| External automation (Telegram) | HFI-E1 | n8n + Bearer token |

---

*Last updated: 2026-05-31 — align ticket status after each deploy.*
