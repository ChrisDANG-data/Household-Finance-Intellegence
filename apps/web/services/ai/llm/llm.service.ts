import { env } from "@/lib/env";
import { AppError } from "@/utils/errors";
import { claudeClient } from "@/services/ai/advisor/claude-client";

import { geminiClient } from "./gemini-client";
import { logLlmCallFailure, logLlmCallSuccess } from "./llm-log-writer";
import type {
  AiProvider,
  AiProviderAvailability,
  LlmCompleteRequest,
  LlmCompleteResponse,
} from "./types";

export type {
  AiProvider,
  AiProviderAvailability,
  LlmCompleteRequest,
  LlmCompleteResponse,
};

export function isProviderConfigured(provider: AiProvider): boolean {
  if (provider === "gemini") return Boolean(env.ai.geminiApiKey());
  return Boolean(env.ai.anthropicApiKey());
}

export function resolveProvider(requested?: AiProvider): AiProvider {
  if (requested && isProviderConfigured(requested)) {
    return requested;
  }

  const envDefault = process.env.AI_PROVIDER?.toLowerCase();
  if (envDefault === "gemini" && isProviderConfigured("gemini")) {
    return "gemini";
  }
  if (envDefault === "claude" && isProviderConfigured("claude")) {
    return "claude";
  }

  if (isProviderConfigured("claude")) return "claude";
  if (isProviderConfigured("gemini")) return "gemini";

  return requested ?? "claude";
}

export function getAiProviderAvailability(): AiProviderAvailability {
  const claude = isProviderConfigured("claude");
  const gemini = isProviderConfigured("gemini");
  const whisper = process.env.LOCAL_STT_ENABLED !== "false";
  return {
    claude,
    gemini,
    whisper,
    default: resolveProvider(),
  };
}

export async function llmComplete(
  request: LlmCompleteRequest,
): Promise<LlmCompleteResponse> {
  const provider = resolveProvider(request.provider);
  const startedAt = new Date();

  if (!isProviderConfigured(provider)) {
    const keyName =
      provider === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";
    const err = new AppError(`${keyName} is not configured`, {
      code: "LLM_NOT_CONFIGURED",
      statusCode: 503,
    });
    await logLlmCallFailure(request, startedAt, provider, err, request.model);
    throw err;
  }

  try {
    let response: LlmCompleteResponse;

    if (provider === "gemini") {
      response = await geminiClient.complete({
        ...request,
        provider: "gemini",
      });
    } else {
      const result = await claudeClient.complete({
        system: request.system,
        user: request.user,
        model: request.model,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
      });

      response = {
        text: result.text,
        model: result.model,
        provider: "claude",
        usage: result.usage,
      };
    }

    await logLlmCallSuccess(request, response, startedAt, provider);
    return response;
  } catch (error) {
    await logLlmCallFailure(
      request,
      startedAt,
      provider,
      error,
      request.model,
    );
    throw error;
  }
}
