from typing import Dict, Any, TypedDict

from fastapi import FastAPI
from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, END


class OrchestrateRequest(BaseModel):
    message: str
    user_id: str
    months: int = 12
    forecast_start_month: str | None = None
    ai_provider: str | None = None
    financial_state: Dict[str, Any] = Field(default_factory=dict)


class GraphState(TypedDict):
    message: str
    intent: str
    context: str
    policy_notes: str
    answer: str
    recommendation: str
    confidence: float


def planner_agent(state: GraphState) -> GraphState:
    msg = state["message"].lower()
    intent = "general_finance_question"
    if "afford" in msg:
        intent = "affordability_check"
    elif "what if" in msg or "if i" in msg:
        intent = "what_if_simulation"
    elif "why" in msg or "explain" in msg:
        intent = "explanation_request"
    state["intent"] = intent
    return state


def retrieval_agent(state: GraphState) -> GraphState:
    # Placeholder: production version should call apps/web read-only endpoints.
    state["context"] = "Read-only financial snapshot context prepared."
    return state


def policy_agent(state: GraphState) -> GraphState:
    state["policy_notes"] = (
        "Use deterministic financial outputs as source of truth; no DB writes."
    )
    return state


def composer_agent(state: GraphState) -> GraphState:
    state["answer"] = (
        f"Intent: {state['intent']}. {state['context']} {state['policy_notes']}"
    )
    state["recommendation"] = (
        "Review latest forecast timeline and risk summary before decisions."
    )
    state["confidence"] = 0.75
    return state


def build_graph():
    graph = StateGraph(GraphState)
    graph.add_node("plannerAgent", planner_agent)
    graph.add_node("retrievalAgent", retrieval_agent)
    graph.add_node("policyAgent", policy_agent)
    graph.add_node("composerAgent", composer_agent)

    graph.set_entry_point("plannerAgent")
    graph.add_edge("plannerAgent", "retrievalAgent")
    graph.add_edge("retrievalAgent", "policyAgent")
    graph.add_edge("policyAgent", "composerAgent")
    graph.add_edge("composerAgent", END)
    return graph.compile()


app = FastAPI(title="LangGraph Orchestrator", version="0.1.0")
workflow = build_graph()


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/orchestrate")
def orchestrate(body: OrchestrateRequest):
    initial_state: GraphState = {
        "message": body.message,
        "intent": "general_finance_question",
        "context": "",
        "policy_notes": "",
        "answer": "",
        "recommendation": "",
        "confidence": 0.0,
    }
    out = workflow.invoke(initial_state)
    return {
        "answer": out["answer"],
        "recommendation": out["recommendation"],
        "intent": out["intent"],
        "confidence": out["confidence"],
    }
