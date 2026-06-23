import { jsonSuccess } from "@/utils/api-response";
import { withApiHandler } from "@/lib/api/route-handler";
import { documentRepository } from "@/services/document-intelligence/document.repository";
import { AppError } from "@/utils/errors";
import type { DocumentMimeType } from "@/types/documents";
import { isAllowedDocumentMimeType } from "@/utils/file";

export const runtime = "nodejs";
export const maxDuration = 120;

/** GET — list uploaded documents */
export async function GET() {
  return withApiHandler(async () => {
    const documents = await documentRepository.list();
    return jsonSuccess({ documents });
  });
}

/** POST — upload PDF/image, extract and store raw text */
export async function POST(request: Request) {
  return withApiHandler(async () => {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      throw new AppError('Missing "file" in multipart form data', {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    const mimeType = file.type || "application/octet-stream";
    if (!isAllowedDocumentMimeType(mimeType)) {
      throw new AppError(`Unsupported file type: ${mimeType}`, {
        code: "UNSUPPORTED_MIME_TYPE",
        statusCode: 400,
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await documentRepository.upload({
      filename: file.name || "upload",
      mimeType: mimeType as DocumentMimeType,
      buffer,
    });

    return jsonSuccess(
      {
        document: result.document,
        chunksIndexed: result.processing.chunksIndexed,
        wikiPagesWritten: result.processing.wikiPagesWritten,
        obsidianVaultSynced: result.processing.obsidianVaultSynced,
        obligationsSaved: result.processing.obligationsSaved,
        detectedObligations: result.processing.detectedObligations,
        expectedInstallmentCount: result.processing.expectedInstallmentCount,
        warnings: result.processing.warnings,
      },
      { status: 201 },
    );
  });
}
