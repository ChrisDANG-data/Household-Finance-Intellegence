import { withAuthenticatedHandler } from "@/lib/api/authenticated-handler";
import { jsonSuccess } from "@/utils/api-response";
import { documentRepository } from "@/services/document-intelligence/document.repository";

export const runtime = "nodejs";
export const maxDuration = 120;

/** GET — document metadata and extracted text */
export async function GET(
  _request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  return withAuthenticatedHandler(async (userId) => {
    const { documentId } = await context.params;
    const document = await documentRepository.getById(documentId, userId);
    return jsonSuccess({ document });
  });
}

/** POST — re-run text extraction, indexing, and obligation detection */
export async function POST(
  _request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  return withAuthenticatedHandler(async (userId) => {
    const { documentId } = await context.params;
    await documentRepository.getById(documentId, userId);
    const result = await documentRepository.runExtraction(documentId);
    return jsonSuccess({
      document: result.document,
      chunksIndexed: result.processing.chunksIndexed,
      obligationsSaved: result.processing.obligationsSaved,
      detectedObligations: result.processing.detectedObligations,
      expectedInstallmentCount: result.processing.expectedInstallmentCount,
      warnings: result.processing.warnings,
    });
  });
}
