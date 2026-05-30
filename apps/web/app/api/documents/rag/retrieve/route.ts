import { jsonSuccess } from "@/utils/api-response";
import { withApiHandler } from "@/lib/api/route-handler";
import { documentRagService } from "@/services/document-intelligence/indexing/rag.service";
import { AppError } from "@/utils/errors";

export const runtime = "nodejs";

/** POST — Retrieve relevant document chunks without LLM generation (no API key needed) */
export async function POST(request: Request) {
  return withApiHandler(async () => {
    const body = await request.json();
    const { query, topK } = body;

    if (!query || typeof query !== "string") {
      throw new AppError('Missing required field: "query"', {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    const result = await documentRagService.retrieve({
      query,
      topK: typeof topK === "number" ? topK : undefined,
    });

    return jsonSuccess(result);
  });
}
