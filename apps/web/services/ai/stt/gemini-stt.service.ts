import { env } from "@/lib/env";
import { AppError } from "@/utils/errors";

const DEFAULT_MODEL = process.env.GEMINI_STT_MODEL ?? "gemini-2.0-flash";

function parseRetryDelaySeconds(body: string): number | null {
  const match = body.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : null;
}

/**
 * Transcribe audio with Gemini multimodal API (uses GEMINI_API_KEY).
 */
export async function transcribeAudioWithGemini(
  audioBase64: string,
  mimeType: string,
): Promise<string> {
  const apiKey = env.ai.geminiApiKey();
  if (!apiKey) {
    throw new AppError("GEMINI_API_KEY is not configured for voice transcription", {
      code: "STT_NOT_CONFIGURED",
      statusCode: 503,
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: audioBase64,
              },
            },
            {
              text: "Transcribe the spoken English audio verbatim. Return only the transcription text with no quotes, labels, or commentary.",
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 429) {
      const retrySeconds = parseRetryDelaySeconds(body);
      const retryHint = retrySeconds
        ? ` Please retry in about ${retrySeconds} seconds.`
        : " Please retry in about one minute.";
      throw new AppError(
        `Google voice quota exceeded for Gemini free tier.${retryHint} You can continue by typing, or enable billing/increase quota.`,
        {
          code: "STT_QUOTA_EXCEEDED",
          statusCode: 429,
        },
      );
    }
    throw new AppError(
      `Gemini transcription failed (${response.status}).`,
      {
        code: "STT_REQUEST_FAILED",
        statusCode: 502,
      },
    );
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";

  if (!text) {
    throw new AppError("Gemini returned empty transcription", {
      code: "STT_EMPTY_RESPONSE",
      statusCode: 502,
    });
  }

  return text;
}
