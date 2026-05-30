import { env } from "@/lib/env";
import { AppError } from "@/utils/errors";

import type {
  LlmCompleteRequest,
  LlmCompleteResponse,
  LlmTokenUsage,
} from "./types";

/**
 * Gemini API — text generation only; no financial logic.
 */
const FALLBACK_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash"] as const;

export class GeminiClient {
  private readonly defaultModel =
    process.env.GEMINI_MODEL ?? FALLBACK_MODELS[0];

  async complete(request: LlmCompleteRequest): Promise<LlmCompleteResponse> {
    const apiKey = env.ai.geminiApiKey();
    if (!apiKey) {
      throw new AppError("GEMINI_API_KEY is not configured", {
        code: "LLM_NOT_CONFIGURED",
        statusCode: 503,
      });
    }

    const modelsToTry = request.model
      ? [request.model]
      : [this.defaultModel, ...FALLBACK_MODELS.filter((m) => m !== this.defaultModel)];

    let lastError: AppError | null = null;

    for (const model of modelsToTry) {
      try {
        return await this.completeWithModel(apiKey, model, request);
      } catch (error) {
        if (error instanceof AppError) {
          lastError = error;
          const retryable =
            error.statusCode === 429 ||
            error.message.includes("429") ||
            error.message.includes("NOT_FOUND") ||
            error.message.includes("404");
          if (!retryable) throw error;
          continue;
        }
        throw error;
      }
    }

    throw (
      lastError ??
      new AppError("Gemini API request failed", {
        code: "LLM_REQUEST_FAILED",
        statusCode: 502,
      })
    );
  }

  private async completeWithModel(
    apiKey: string,
    model: string,
    request: LlmCompleteRequest,
  ): Promise<LlmCompleteResponse> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: request.system }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: request.user }],
          },
        ],
        generationConfig: {
          maxOutputTokens: request.maxTokens ?? 2048,
          temperature: request.temperature ?? 0,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      const statusCode = response.status === 429 ? 429 : 502;
      throw new AppError(`Gemini API error: ${response.status} ${body}`, {
        code: "LLM_REQUEST_FAILED",
        statusCode,
      });
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
      promptFeedback?: { blockReason?: string };
    };

    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim() ?? "";

    if (!text) {
      const block = data.promptFeedback?.blockReason;
      const finish = data.candidates?.[0]?.finishReason;
      throw new AppError(
        block
          ? `Gemini blocked the response: ${block}`
          : finish
            ? `Gemini returned no text (finish: ${finish})`
            : "Gemini API returned empty content",
        {
          code: "LLM_EMPTY_RESPONSE",
          statusCode: 502,
        },
      );
    }

    const usage: LlmTokenUsage | undefined =
      data.usageMetadata?.promptTokenCount != null &&
      data.usageMetadata?.candidatesTokenCount != null
        ? {
            input_tokens: data.usageMetadata.promptTokenCount,
            output_tokens: data.usageMetadata.candidatesTokenCount,
            estimated: false,
          }
        : undefined;

    return {
      text,
      model,
      provider: "gemini",
      usage,
    };
  }
}

export const geminiClient = new GeminiClient();
