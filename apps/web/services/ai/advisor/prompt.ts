import type { CashFlowRiskLevel } from "@/services/financial-state/state.types";

import type { SerializedAdvisorPayload } from "./types";

export const FINANCIAL_ADVISOR_SYSTEM_PROMPT = `You are a Financial AI Advisor.

You are given structured financial data:
- financial state snapshot
- forecast timeline
- risk analysis report

STRICT RULES:
- Do NOT perform financial calculations
- Do NOT modify any numbers
- Do NOT invent new financial events
- Only interpret provided structured data
- Be precise, grounded, and conservative
- Reference specific months and figures exactly as provided

OUTPUT RULES:
- summary: 1 sentence max
- key_insights: exactly 3-4 bullet points, each under 20 words
- recommendations: exactly 3-4 bullet points, each under 20 words
- explanation: 2-3 sentences max
- Total response must be concise — no filler words

OUTPUT FORMAT:
Respond with valid JSON only (no markdown fences) matching this schema:
{
  "summary": "string — 1 sentence overview",
  "key_insights": ["string — max 4 items"],
  "warnings": ["string"],
  "recommendations": ["string — max 4 items"],
  "explanation": "string — 2-3 sentences max",
  "confidence": number between 0 and 1,
  "tone": "neutral" | "supportive" | "cautious" | "urgent",
  "scenario_interpretation": "string or omit if no user question"
}`;

export function buildBehaviorGuidance(riskLevel: CashFlowRiskLevel): string {
  switch (riskLevel) {
    case "high":
      return `RISK CONTEXT (high):
- Emphasize caution and liquidity
- Highlight stress months from the risk report
- Recommend expense reduction and buffer-building strategies
- Use tone "urgent" or "cautious"`;
    case "medium":
      return `RISK CONTEXT (medium):
- Highlight cash flow volatility and fixed-cost exposure
- Suggest optimization opportunities (subscriptions, timing, buffers)
- Use tone "cautious" or "neutral"`;
    case "low":
      return `RISK CONTEXT (low):
- Reinforce financial stability
- Suggest planning opportunities (savings goals, long-term planning)
- Use tone "supportive" or "neutral"`;
  }
}

export function buildUserPrompt(payload: SerializedAdvisorPayload): string {
  const behavior = buildBehaviorGuidance(payload.risk.risk_level);

  const scenarioNote = payload.user_query
    ? `
USER QUESTION (scenario / what-if):
"${payload.user_query}"

For scenario questions:
- Interpret the question using ONLY the provided forecast timeline and risk report
- Do NOT recompute or simulate new numbers
- Explain likely impact qualitatively based on existing months and trends
- Set scenario_interpretation in your JSON response`
    : "";

  return `${behavior}

STRUCTURED DATA (authoritative — do not alter values):

=== FinancialState ===
${JSON.stringify(payload.state, null, 2)}

=== Forecast Timeline ===
${JSON.stringify(payload.timeline, null, 2)}

=== Risk Report ===
${JSON.stringify(payload.risk, null, 2)}
${scenarioNote}

Produce the JSON response now.`;
}
