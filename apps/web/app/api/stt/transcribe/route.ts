import { env } from "@/lib/env";
import { transcribeWithFallback } from "@/services/ai/stt/transcribe-with-fallback";
import { jsonError, jsonSuccess } from "@/utils/api-response";
import { AppError, toAppError } from "@/utils/errors";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 8 * 1024 * 1024;

type SttProvider = "gemini" | "whisper" | "local";

function parseProvider(raw: FormDataEntryValue | null): SttProvider {
  if (raw === "whisper" || raw === "openai" || raw === "cloud") return "whisper";
  if (raw === "gemini") return "gemini";
  if (raw === "local") return "local";
  // Default: cloud Whisper when configured, else local Xenova
  if (env.ai.whisperApiKey()?.trim()) return "whisper";
  return "local";
}

/** POST — transcribe audio: cloud Whisper, local Whisper, or Gemini */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("audio");
    const provider = parseProvider(formData.get("provider"));

    if (!(file instanceof File) || file.size === 0) {
      throw new AppError("audio file is required", {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    if (file.size > MAX_BYTES) {
      throw new AppError("audio file exceeds 8MB limit", {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    const mimeType = file.type || "audio/webm";
    const buffer = Buffer.from(await file.arrayBuffer());

    const { text, provider: usedProvider } = await transcribeWithFallback(
      buffer,
      mimeType,
      provider,
    );

    return jsonSuccess({
      text,
      provider: usedProvider,
    });
  } catch (error) {
    return jsonError(toAppError(error));
  }
}
