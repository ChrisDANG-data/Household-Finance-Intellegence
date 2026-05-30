import { transcribeAudioWithGemini } from "@/services/ai/stt/gemini-stt.service";
import { transcribeAudioLocalWhisper } from "@/services/ai/stt/local-whisper-stt.service";
import { jsonError, jsonSuccess } from "@/utils/api-response";
import { AppError, toAppError } from "@/utils/errors";

const MAX_BYTES = 8 * 1024 * 1024;

type SttProvider = "gemini" | "local";

function parseProvider(raw: FormDataEntryValue | null): SttProvider {
  if (raw === "local" || raw === "whisper") return "local";
  if (raw === "gemini") return "gemini";
  return "gemini";
}

/** POST — transcribe audio: local Whisper (free) or Gemini multimodal */
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

    const text =
      provider === "local"
        ? await transcribeAudioLocalWhisper(buffer, mimeType)
        : await transcribeAudioWithGemini(buffer.toString("base64"), mimeType);

    return jsonSuccess({
      text,
      provider,
    });
  } catch (error) {
    return jsonError(toAppError(error));
  }
}
