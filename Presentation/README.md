# Presentation materials

Files for the **Household Financial Intelligence** final project talk.

| File | Purpose |
|------|---------|
| [`SLIDES.md`](./SLIDES.md) | Slide copy — paste into Canva / PowerPoint |
| [`PRESENTATION_QA.md`](./PRESENTATION_QA.md) | 30 Q&A for rehearsal |
| [`generate_slides.py`](./generate_slides.py) | Regenerate `.pptx` from Python |
| [`Household_Financial_Intelligence.pptx`](./Household_Financial_Intelligence.pptx) | Generated deck (after running script) |

## Regenerate PowerPoint

Use the repo-root Python venv (one-time setup):

```powershell
cd "c:\DLH\2026 Inference AI Course\Final_Project_AI"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r Presentation/requirements.txt
python Presentation/generate_slides.py
```

Next times (venv already created):

```powershell
cd "c:\DLH\2026 Inference AI Course\Final_Project_AI"
.\.venv\Scripts\Activate.ps1
python Presentation/generate_slides.py
```

Output: `Presentation/Household_Financial_Intelligence.pptx`

**Note:** LangGraph has its own venv at `services/langgraph-orchestrator/.venv` — keep that separate.

## Related docs in repo

- [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) — four engines
- [`docs/INTEGRATIONS.md`](../docs/INTEGRATIONS.md) — Plaid, n8n, Telegram
- [`docs/N8N_TELEGRAM_LOCAL.md`](../docs/N8N_TELEGRAM_LOCAL.md) — Telegram → ngrok → n8n

## Before you present

1. Replace `[Your name]` on slide 1.
2. Style the deck in PowerPoint / Canva (generator uses plain theme).
3. Rehearse demo: `/ledger`, `/balances`, `/simulation` (Ask AI).
4. Optional Telegram demo: n8n + ngrok running locally.
