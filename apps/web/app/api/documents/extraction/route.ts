import { jsonSuccess } from "@/utils/api-response";
import { withApiHandler } from "@/lib/api/route-handler";
import {
  documentExtractionService,
  type ExtractedObligation,
} from "@/services/document-intelligence/extraction/document-extraction.service";
import { AppError } from "@/utils/errors";

export const runtime = "nodejs";

interface ExtractionBody {
  documentId: string;
  /** Set to true to save obligations to DB. Default: false (preview only). */
  confirm?: boolean;
  ai_provider?: "claude" | "gemini";
  /** User-edited obligations from the review dialog (required when confirm is true). */
  obligations?: ExtractedObligation[];
  /** Replace any prior obligations/events from this document on confirm. */
  replaceExisting?: boolean;
}

/**
 * POST — Extract financial obligations from a document.
 *
 * Two-step flow:
 * 1. Call with { documentId } → returns extracted obligations for review (not saved)
 * 2. Call with { documentId, confirm: true, obligations: [...] } → saves to DB
 */
export async function POST(request: Request) {
  return withApiHandler(async () => {
    const body = (await request.json()) as ExtractionBody;
    if (!body?.documentId) {
      throw new AppError("documentId is required", {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    if (body.confirm) {
      const obligations =
        body.obligations ??
        (await documentExtractionService.extract(body.documentId)).obligations;

      const savedCount = await documentExtractionService.saveObligations(
        body.documentId,
        obligations,
        { replaceExisting: body.replaceExisting ?? true },
      );

      const skipped = obligations.filter(
        (ob) => !ob.amount || Number(ob.amount) <= 0,
      );

      return jsonSuccess({
        documentId: body.documentId,
        obligations,
        savedToDb: savedCount,
        skipped: skipped.length,
        message: `Saved ${savedCount} obligation(s) to your ledger.`,
      });
    }

    const payload = await documentExtractionService.extract(body.documentId, {
      provider: body.ai_provider,
    });
    const withAmount = payload.obligations.filter(
      (ob) => ob.amount && Number(ob.amount) > 0,
    );
    const withoutAmount = payload.obligations.filter(
      (ob) => !ob.amount || Number(ob.amount) <= 0,
    );

    return jsonSuccess({
      documentId: body.documentId,
      obligations: payload.obligations,
      expectedInstallmentCount: payload.expectedInstallmentCount,
      willSave: withAmount,
      willSkip: withoutAmount,
      savedToDb: 0,
      message: `Found ${payload.obligations.length} obligation(s). Review and confirm to add them to your ledger.`,
    });
  });
}
