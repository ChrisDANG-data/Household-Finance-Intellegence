# Privacy & data handling — Household Financial Intelligence

This document describes what the MVP stores, where it lives, who can access it, and how to request deletion. It reflects **Tier 1 production hardening** (household auth, encrypted Plaid tokens, locked automation webhooks).

> **Not legal advice.** For a public product in Canada, consult counsel on PIPEDA and provincial requirements.

---

## What we collect

| Data type | Examples | Purpose |
|-----------|----------|---------|
| **Ledger events** | Income, expenses, investments | Forecasts, summaries, scenario chat |
| **Financial state** | `current_cash`, monthly income | Opening balance for projections |
| **Uploaded documents** | PDFs, images (bills, policies) | Extraction, obligations, RAG Q&A |
| **Plaid connection** | Encrypted access token, account balances | Live cash / asset sync |
| **Chat / automation** | Questions via web or Telegram (n8n) | AI explanations (not canonical math) |

We do **not** sell household data. LLM providers process text only when you use AI features (see Subprocessors).

---

## Where data is stored

| Layer | Technology | Contents |
|-------|------------|----------|
| **Database** | Neon PostgreSQL | Events, obligations, document text, embeddings, encrypted Plaid tokens |
| **Object storage** | Vercel Blob (prod) or local `.data/uploads` (dev) | Original uploaded files |
| **Application** | Vercel (Next.js) | Server-side API; no persistent disk in production |
| **Optional wiki** | Obsidian vault on your machine | Human-readable export (your control) |
| **Automation** | Local n8n + Telegram | Forwards questions to production API with Bearer token |

---

## Access control (Tier 1)

| Control | Behavior |
|---------|----------|
| **Household login** | On Vercel (and when `AUTH_ENABLED=true`), pages and APIs require a signed session cookie except `/`, `/login`, and auth/health endpoints. |
| **User accounts** | Usernames and **password hashes** (scrypt) live in Postgres `users` table — never plaintext passwords. |
| **Automation webhooks** | n8n/Telegram routes require `Authorization: Bearer <AUTOMATION_WEBHOOK_TOKEN>`. In production, the token is **required** (fail closed). |
| **Plaid tokens** | Stored **encrypted at rest** when `TOKEN_ENCRYPTION_KEY` is set (required on Vercel). Never returned to the browser. |
| **Blob files** | Private; read via server token only. |

Local development: auth and encryption are **off by default** unless you set `AUTH_ENABLED=true` and related env vars.

---

## AI & subprocessors

When you use scenario chat, RAG, document extraction, or voice:

- **Anthropic** (Claude), **Google** (Gemini), and/or **OpenAI** (embeddings, Whisper) may receive **portions of ledger text, document chunks, or your question**.
- **Money calculations** remain in deterministic code — the LLM explains and retrieves; it does not write ledger truth.

**Production next step (Tier 2):** PII minimization / tokenization before LLM calls (e.g. Presidio-style redaction).

---

## Retention & deletion

| Item | Current MVP | Planned |
|------|-------------|---------|
| Financial events | Manual delete via ledger API | Household wipe |
| Documents | Persists until manual DB/blob cleanup | Delete API (file + chunks + embeddings) |
| Plaid link | Persists until item removed | Disconnect + revoke via Plaid |
| LLM dev logs | Optional `logs/llm-calls.jsonl` locally | Off in production by default |

To remove data today: delete rows in Neon (events, documents), remove blobs in Vercel Storage, revoke Plaid item in Plaid dashboard, and rotate `AUTOMATION_WEBHOOK_TOKEN` if exposed.

---

## Environment variables (security)

Set on **Vercel** before exposing real household data:

```env
AUTH_SECRET=<random 32+ chars>
TOKEN_ENCRYPTION_KEY=<32-byte base64 or 64-char hex>
AUTOMATION_WEBHOOK_TOKEN=<random token for n8n>
AUTH_ALLOW_REGISTRATION=false
```

Create the first production user (from `apps/web`):

```bash
npx tsx scripts/create-user.ts your_username your_password
```

Generate a 32-byte encryption key (PowerShell):

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

---

## Contact

For this MVP, the **household operator** (you) is the data controller. Document any support contact here if you ship beyond a personal pilot.

---

## Related docs

- [INTEGRATIONS.md](./INTEGRATIONS.md) — Plaid, n8n, Blob storage
- [ARCHITECTURE.md](./ARCHITECTURE.md) — Four engines & AI boundaries
