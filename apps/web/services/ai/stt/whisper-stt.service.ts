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

/** OpenRouter keys are often stored as OPENAI_API_KEY with an sk-or- prefix. */
function usesOpenRouter(apiKey: string): boolean {
  if (env.ai.openRouterApiKey()) return true;
  return apiKey.startsWith("sk-or-");
}

/**
 * Transcribe audio with Whisper via OpenRouter (OPENROUTER_API_KEY) or OpenAI (OPENAI_API_KEY).
 */
export async function transcribeAudioWithWhisper(
  audio: Buffer,
  mimeType: string,
  filename = "recording.webm",
): Promise<string> {
  const apiKey = env.ai.whisperApiKey();
  if (!apiKey) {
    throw new AppError(
      "OPENROUTER_API_KEY (or OPENAI_API_KEY) is not configured for Whisper transcription",
      {
        code: "STT_NOT_CONFIGURED",
        statusCode: 503,
      },
    );
  }

  if (usesOpenRouter(apiKey)) {
    return transcribeViaOpenRouter(audio, mimeType, apiKey);
  }

  return transcribeViaOpenAI(audio, mimeType, filename, apiKey);
}

async function transcribeViaOpenRouter(
  audio: Buffer,
  mimeType: string,
  apiKey: string,
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
      throw new AppError(
        "OpenRouter Whisper quota or credits exhausted. Please retry or type your question.",
        { code: "STT_QUOTA_EXCEEDED", statusCode: 429 },
      );
    }
    throw new AppError(
      `OpenRouter Whisper failed (${response.status}): ${body.slice(0, 200)}`,
      { code: "STT_REQUEST_FAILED", statusCode: 502 },
    );
  }

  const data = (await response.json()) as { text?: string };
  const text = data.text?.trim() ?? "";
  if (!text) {
    throw new AppError("Whisper returned empty transcription", {
      code: "STT_EMPTY_RESPONSE",
      statusCode: 502,
    });
  }

  return text;
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

  const data = (await response.json()) as { text?: string };
  const text = data.text?.trim() ?? "";
  if (!text) {
    throw new AppError("Whisper returned empty transcription", {
      code: "STT_EMPTY_RESPONSE",
      statusCode: 502,
    });
  }

  return text;
}
