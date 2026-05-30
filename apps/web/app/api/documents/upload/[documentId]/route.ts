import { jsonSuccess } from "@/utils/api-response";
import { withApiHandler } from "@/lib/api/route-handler";
import { documentRepository } from "@/services/document-intelligence/document.repository";

export const runtime = "nodejs";

/** GET — document metadata and extracted text */
export async function GET(
  _request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  return withApiHandler(async () => {
    const { documentId } = await context.params;
    const document = await documentRepository.getById(documentId);
    return jsonSuccess({ document });
  });
}

/** POST — re-run text extraction (useful for scanned PDFs after OCR upgrade) */
export async function POST(
  _request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  return withApiHandler(async () => {
    const { documentId } = await context.params;
    const document = await documentRepository.runExtraction(documentId);
    return jsonSuccess({ document });
  });
}
