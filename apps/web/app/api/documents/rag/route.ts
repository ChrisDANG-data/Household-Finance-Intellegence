import { jsonSuccess } from "@/utils/api-response";
import { withApiHandler } from "@/lib/api/route-handler";
import { documentRagService } from "@/services/document-intelligence/indexing/rag.service";
import { AppError } from "@/utils/errors";

export const runtime = "nodejs";

/** POST — Ask a question about uploaded documents using RAG */
export async function POST(request: Request) {
  return withApiHandler(async () => {
    const body = await request.json();
    const { question, topK, ai_provider } = body;

    if (!question || typeof question !== "string") {
      throw new AppError('Missing required field: "question"', {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    const result = await documentRagService.ask(question, {
      topK: typeof topK === "number" ? topK : undefined,
      provider:
        ai_provider === "gemini" || ai_provider === "claude"
          ? ai_provider
          : undefined,
    });

    return jsonSuccess(result);
  });
}
