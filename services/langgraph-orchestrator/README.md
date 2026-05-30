# LangGraph Orchestrator

Python FastAPI + LangGraph service for multi-agent orchestration.

## Purpose
- Read-only reasoning over snapshots from `apps/web`
- Multi-agent flow (`planner -> retrieval -> policy -> composer`)
- No direct DB writes

## Run locally

```bash
cd services/langgraph-orchestrator
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8081
```

## Endpoint
- `POST /orchestrate`

### Request
```json
{
  "message": "Can I afford a vacation?",
  "user_id": "default",
  "months": 12,
  "forecast_start_month": "2026-06",
  "ai_provider": "claude",
  "financial_state": {}
}
```

### Response
```json
{
  "answer": "Short answer...",
  "recommendation": "Action...",
  "intent": "general_finance_question",
  "confidence": 0.8
}
```
