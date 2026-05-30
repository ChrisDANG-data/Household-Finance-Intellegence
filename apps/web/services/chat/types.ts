import type { SerializedScenarioChatResponse } from "@/lib/serialize-scenario-response";
import type { ScenarioIntent } from "@/services/scenario-chat/types";
import type { CashFlowRiskLevel } from "@/services/financial-state/state.types";
import type { RawFinancialEvent } from "@/types/financial-state";

export interface ScenarioChatRequest {
  message: string;
  user_id: string;
  current_cash: number;
  monthly_income?: number;
  events: RawFinancialEvent[];
  months?: number;
  forecast_start_month?: string;
  use_llm?: boolean;
  ai_provider?: "claude" | "gemini";
}

export interface UserChatMessage {
  id: string;
  role: "user";
  content: string;
  createdAt: string;
}

export interface AssistantChatMessage {
  id: string;
  role: "assistant";
  content: string;
  createdAt: string;
  isStreaming?: boolean;
  response?: SerializedScenarioChatResponse;
}

export type ChatMessage = UserChatMessage | AssistantChatMessage;

export type ScenarioStreamEvent =
  | { type: "structured"; data: SerializedScenarioChatResponse }
  | { type: "text"; delta: string }
  | { type: "done"; data: SerializedScenarioChatResponse }
  | { type: "error"; message: string };

export interface StreamScenarioHandlers {
  onStructured?: (data: SerializedScenarioChatResponse) => void;
  onTextDelta?: (delta: string, fullText: string) => void;
  onDone?: (data: SerializedScenarioChatResponse) => void;
  onError?: (message: string) => void;
}

export type { SerializedScenarioChatResponse, ScenarioIntent, CashFlowRiskLevel };
