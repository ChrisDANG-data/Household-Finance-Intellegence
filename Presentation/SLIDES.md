# Slide copy — Household Financial Intelligence

Use this text in Canva or PowerPoint. Speaker notes are under each slide.

---

## Slide 1 — Title

**Household Financial Intelligence**

AI-powered personal finance — Final Project

- 2026 Inference AI Course
- [Your name]
- One ledger, live bank data, document intelligence, mobile access

**Speaker note:** Introduce the problem: money is scattered; generic chatbots guess. This app centralizes truth and uses AI to explain, not invent numbers.

---

## Slide 2 — Problem

**Simple questions are hard to answer**

1. Money is everywhere — spreadsheets, bank apps, PDF bills
2. “Can we afford $20K travel in July?” — no single place to simulate
3. Contracts and tax bills sit in folders — not in a ledger
4. On the go — need answers from your phone, not only the laptop

**Speaker note:** Use the two example questions from class: China trip (affordability) and property tax installment (cash check).

---

## Slide 3 — Solution (four pillars)

**Subtitle:** Canonical ledger · Live Plaid · Documents · Mobile automation

### 01 — Centralize data in PostgreSQL

**One financial truth in Postgres**

- Manual entry → `FinancialEvent` (ledger)
- Upload PDFs → `FinancialObligation` → confirm → `FinancialEvent`
- Forecast and Q&A read the same ledger

### 02 — Live balances with Plaid + AI Q&A

**Plaid Direct API** (not MCP) for linked accounts

- Sync → `current_cash` (checking) + balance history on `/balances`
- Ledger + Plaid → 6-month forecast + disposable assets
- Scenario Chat: **engines compute; AI explains**

### 03 — Documents: RAG + Obsidian

**Upload once, use two ways**

- **RAG** (Postgres + embeddings) → AI retrieves bill/contract text
- **Obsidian wiki** → human-readable notes and links
- Structured amounts still land in the ledger after confirm

### 04 — Telegram on the go

**Phone → automation → same APIs as the web app**

```text
Telegram → ngrok (local dev tunnel) → n8n → Vercel API → reply to Telegram
```

- n8n: bot webhook + workflows (Q&A, ledger, monthly Plaid sync)
- Vercel: secured automation routes — same logic as the web UI
- Production: n8n on Railway (stable URL; no ngrok)

**Speaker note:** Emphasize “deterministic math first, AI second.” ngrok is only because n8n runs on localhost during development.

---

## Slide 4 — Four engines

| Engine | Role |
|--------|------|
| Document Intelligence | Upload, OCR, extract obligations, RAG |
| Financial State | Canonical ledger in PostgreSQL |
| Forecast Simulation | Deterministic cash-flow math |
| AI Explanation | Narrates read-only snapshots — never owns the math |

**Rule:** AI never calculates balances from scratch when DB events exist.

---

## Slide 5 — Infrastructure

```text
Browser → Vercel (Next.js) → Neon PostgreSQL + pgvector + Blob storage
Telegram → n8n (local/Railway) → Vercel automation APIs
Plaid Direct API ← Vercel (sandbox)
LangGraph (optional) ← scenario chat routing
```

**Live app:** https://household-financial-web.vercel.app

---

## Slide 6 — Demo: hard questions

| Question | How the app answers |
|----------|---------------------|
| Can we afford **$20K China in July**? | What-if forecast: add one-time expense → closing balance + risk |
| Enough cash for **2nd property tax in June**? | Ledger lookup (property tax) + disposable assets on `/balances` |
| What does my **insurance bill** say? | RAG on uploaded PDF |

**Demo path:** `/ledger` → `/balances` (Sync Plaid) → `/simulation` (Ask AI)

---

## Slide 7 — Thank you / Q&A

**Household Financial Intelligence**

- GitHub: [your repo URL]
- Live demo: household-financial-web.vercel.app
- Questions?

**Speaker note:** Point to `Presentation/PRESENTATION_QA.md` for rehearsed answers.
