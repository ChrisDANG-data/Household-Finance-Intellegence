import { jsonSuccess } from "@/utils/api-response";
import { withApiHandler } from "@/lib/api/route-handler";
import { documentEmbeddingService } from "@/services/document-intelligence/indexing/embedding.service";
import { AppError } from "@/utils/errors";

export const runtime = "nodejs";

/** POST — Index a document's extracted text into vector chunks for RAG */
export async function POST(request: Request) {
  return withApiHandler(async () => {
    const body = await request.json();
    const { documentId } = body;

    if (!documentId || typeof documentId !== "string") {
      throw new AppError('Missing required field: "documentId"', {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    const records = await documentEmbeddingService.indexDocument(documentId);

    return jsonSuccess({
      documentId,
      chunksIndexed: records.length,
      records: records.map(({ id, chunkIndex, metadata }) => ({
        id,
        chunkIndex,
        metadata,
      })),
    });
  });
}
