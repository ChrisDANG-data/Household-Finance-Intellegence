import { env } from "@/lib/env";
import { AppError } from "@/utils/errors";

const OPENROUTER_TRANSCRIPTIONS_URL =
  "https://openrouter.ai/api/v1/audio/transcriptions";

const DEFAULT_OPENROUTER_MODEL =
  process.env.OPENROUTER_WHISPER_MODEL ?? "openai/whisper-1";
const DEFAULT_OPENAI_MODEL = process.env.WHISPER_MODEL ?? "whisper-1";

function audioFormatFromMime(mimeType: string): string {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("flac")) return "flac";
  return "webm";
}

function quotaExhaustedMessage(hasOpenAiFallback: boolean): string {
  if (hasOpenAiFallback) {
    return "OpenRouter Whisper credits exhausted. Retrying with OpenAI Whisper…";
  }
  return (
    "OpenRouter Whisper credits exhausted. Add a real OPENAI_API_KEY in apps/web/.env " +
    "(platform.openai.com → API keys), set STT_CLOUD_PROVIDER=openai, restart dev — or type your question."
  );
}

/**
 * Transcribe audio with Whisper via OpenAI and/or OpenRouter.
 * STT_CLOUD_PROVIDER=openai skips OpenRouter; auto falls back to OpenAI on quota errors.
 */
export async function transcribeAudioWithWhisper(
  audio: Buffer,
  mimeType: string,
  filename = "recording.webm",
): Promise<string> {
  const openRouterKey = env.ai.openRouterApiKey()?.trim();
  const openAiKey = env.ai.openaiApiKey()?.trim();
  const preference = env.ai.sttCloudPreference();

  if (!openRouterKey && !openAiKey) {
    throw new AppError(
      "OPENAI_API_KEY (or OPENROUTER_API_KEY) is not configured for Whisper transcription",
      { code: "STT_NOT_CONFIGURED", statusCode: 503 },
    );
  }

  if (preference === "openai") {
    if (!openAiKey) {
      throw new AppError(
        "STT_CLOUD_PROVIDER=openai but OPENAI_API_KEY is missing. Add a key from platform.openai.com.",
        { code: "STT_NOT_CONFIGURED", statusCode: 503 },
      );
    }
    return transcribeViaOpenAI(audio, mimeType, filename, openAiKey);
  }

  if (preference === "openrouter") {
    if (!openRouterKey) {
      throw new AppError(
        "STT_CLOUD_PROVIDER=openrouter but OPENROUTER_API_KEY is missing.",
        { code: "STT_NOT_CONFIGURED", statusCode: 503 },
      );
    }
    return transcribeViaOpenRouter(audio, mimeType, openRouterKey, false);
  }

  // auto: OpenRouter first when configured, then OpenAI on quota/billing errors
  if (openRouterKey) {
    try {
      return await transcribeViaOpenRouter(
        audio,
        mimeType,
        openRouterKey,
        Boolean(openAiKey),
      );
    } catch (error) {
      const canFallback =
        openAiKey &&
        error instanceof AppError &&
        error.code === "STT_QUOTA_EXCEEDED";
      if (!canFallback) throw error;
      return transcribeViaOpenAI(audio, mimeType, filename, openAiKey);
    }
  }

  return transcribeViaOpenAI(audio, mimeType, filename, openAiKey!);
}

async function transcribeViaOpenRouter(
  audio: Buffer,
  mimeType: string,
  apiKey: string,
  hasOpenAiFallback: boolean,
): Promise<string> {
  const response = await fetch(OPENROUTER_TRANSCRIPTIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": env.appUrl,
      "X-Title": "FinIntel",
    },
    body: JSON.stringify({
      model: DEFAULT_OPENROUTER_MODEL,
      input_audio: {
        data: audio.toString("base64"),
        format: audioFormatFromMime(mimeType),
      },
      language: "en",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 429 || response.status === 402) {
      throw new AppError(quotaExhaustedMessage(hasOpenAiFallback), {
        code: "STT_QUOTA_EXCEEDED",
        statusCode: 429,
      });
    }
    throw new AppError(
      `OpenRouter Whisper failed (${response.status}): ${body.slice(0, 200)}`,
      { code: "STT_REQUEST_FAILED", statusCode: 502 },
    );
  }

  return parseWhisperText(await response.json());
}

async function transcribeViaOpenAI(
  audio: Buffer,
  mimeType: string,
  filename: string,
  apiKey: string,
): Promise<string> {
  const formData = new FormData();
  formData.append(
    "file",
    new File([new Uint8Array(audio)], filename, { type: mimeType }),
  );
  formData.append("model", DEFAULT_OPENAI_MODEL);
  formData.append("language", "en");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 401) {
      throw new AppError(
        "OPENAI_API_KEY is invalid. Replace the placeholder in apps/web/.env with a real key from platform.openai.com (billing required for Whisper).",
        { code: "STT_NOT_CONFIGURED", statusCode: 503 },
      );
    }
    if (response.status === 429) {
      throw new AppError(
        "OpenAI Whisper rate limit reached. Please retry shortly or type your question.",
        { code: "STT_QUOTA_EXCEEDED", statusCode: 429 },
      );
    }
    throw new AppError(
      `Whisper transcription failed (${response.status}): ${body.slice(0, 200)}`,
      { code: "STT_REQUEST_FAILED", statusCode: 502 },
    );
  }

  return parseWhisperText(await response.json());
}

function parseWhisperText(data: unknown): string {
  const text = (data as { text?: string }).text?.trim() ?? "";
  if (!text) {
    throw new AppError("Whisper returned empty transcription", {
      code: "STT_EMPTY_RESPONSE",
      statusCode: 502,
    });
  }
  return text;
}
