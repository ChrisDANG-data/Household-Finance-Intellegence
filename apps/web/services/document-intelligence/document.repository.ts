import { randomUUID } from "node:crypto";

import { ExtractionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { saveDocumentFile } from "@/lib/storage/document-storage";
import { serializeDocument, type SerializedDocument } from "@/lib/serializers";
import { textExtractionService } from "@/services/document-intelligence/extraction/text-extraction.service";
import type { ExtractedObligation } from "@/services/document-intelligence/extraction/document-extraction.service";
import type { DocumentMimeType, ReviewableObligation } from "@/types/documents";
import { documentUploadService } from "@/services/document-intelligence/upload/document-upload.service";
import { AppError } from "@/utils/errors";
import { env } from "@/lib/env";
import { bytesToMegabytes } from "@/utils/file";

export interface UploadDocumentInput {
  filename: string;
  mimeType: DocumentMimeType;
  buffer: Buffer;
}

export interface DocumentProcessSummary {
  chunksIndexed: number;
  wikiPagesWritten: number;
  obsidianVaultSynced: boolean;
  obligationsSaved: number;
  detectedObligations: ReviewableObligation[];
  expectedInstallmentCount: number | null;
  warnings: string[];
}

export interface DocumentUploadResult {
  document: SerializedDocument;
  processing: DocumentProcessSummary;
}

function toReviewable(ob: ExtractedObligation): ReviewableObligation {
  return {
    name: ob.name,
    category: ob.category,
    amount: ob.amount,
    currency: ob.currency,
    frequency: ob.frequency,
    startDate: ob.startDate,
    endDate: ob.endDate,
    notes: ob.notes,
  };
}

export class DocumentRepository {
  async list(): Promise<SerializedDocument[]> {
    const docs = await prisma.document.findMany({
      orderBy: { createdAt: "desc" },
    });
    return docs.map(serializeDocument);
  }

  async getById(id: string): Promise<SerializedDocument> {
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) {
      throw new AppError("Document not found", {
        code: "NOT_FOUND",
        statusCode: 404,
      });
    }
    return serializeDocument(doc);
  }

  async upload(input: UploadDocumentInput): Promise<DocumentUploadResult> {
    const sizeBytes = input.buffer.length;
    documentUploadService.validateMimeType(input.mimeType);

    const maxMb = env.upload.maxSizeMb;
    if (bytesToMegabytes(sizeBytes) > maxMb) {
      throw new AppError(`File exceeds ${maxMb} MB limit`, {
        code: "FILE_TOO_LARGE",
        statusCode: 400,
      });
    }

    const documentId = randomUUID();
    const storagePath = await saveDocumentFile(
      documentId,
      input.filename,
      input.buffer,
      input.mimeType,
    );

    const doc = await prisma.document.create({
      data: {
        id: documentId,
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes,
        storagePath,
        extractionStatus: ExtractionStatus.PENDING,
      },
    });

    return this.runExtraction(doc.id);
  }

  async runExtraction(documentId: string): Promise<DocumentUploadResult> {
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) {
      throw new AppError("Document not found", {
        code: "NOT_FOUND",
        statusCode: 404,
      });
    }

    const processing: DocumentProcessSummary = {
      chunksIndexed: 0,
      wikiPagesWritten: 0,
      obsidianVaultSynced: false,
      obligationsSaved: 0,
      detectedObligations: [],
      expectedInstallmentCount: null,
      warnings: [],
    };

    try {
      const rawText = await textExtractionService.extractFromStorage(
        doc.storagePath,
        doc.mimeType as DocumentMimeType,
      );

      const updated = await prisma.document.update({
        where: { id: documentId },
        data: {
          extractedText: rawText.length > 0 ? rawText : null,
          extractionStatus: ExtractionStatus.COMPLETED,
          extractionError: rawText.length > 0 ? null : "No text could be extracted",
        },
      });

      if (rawText.length === 0) {
        return { document: serializeDocument(updated), processing };
      }

      const [chunksIndexed, wikiResult] = await Promise.all([
        this.indexForSearch(documentId, processing),
        this.syncObsidianWiki(processing),
      ]);
      processing.chunksIndexed = chunksIndexed;
      processing.wikiPagesWritten = wikiResult.pageCount;
      processing.obsidianVaultSynced = wikiResult.vaultSynced;
      await this.extractAndPersistObligations(documentId, processing);

      return { document: serializeDocument(updated), processing };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Extraction failed";
      const updated = await prisma.document.update({
        where: { id: documentId },
        data: {
          extractionStatus: ExtractionStatus.FAILED,
          extractionError: message,
        },
      });
      processing.warnings.push(message);
      return { document: serializeDocument(updated), processing };
    }
  }

  private async syncObsidianWiki(
    processing: DocumentProcessSummary,
  ): Promise<{ pageCount: number; vaultSynced: boolean }> {
    try {
      const { syncObsidianVault } = await import("@/services/wiki");
      const result = await syncObsidianVault();
      return {
        pageCount: result.pageCount,
        vaultSynced: result.vaultSynced,
      };
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Obsidian wiki sync failed";
      processing.warnings.push(`Obsidian wiki not updated: ${msg}`);
      return { pageCount: 0, vaultSynced: false };
    }
  }

  private async indexForSearch(
    documentId: string,
    processing: DocumentProcessSummary,
  ): Promise<number> {
    try {
      const { documentEmbeddingService } = await import(
        "@/services/document-intelligence/indexing/embedding.service"
      );
      const records = await documentEmbeddingService.indexDocument(documentId);
      return records.length;
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Search indexing failed";
      processing.warnings.push(
        `RAG chunks not indexed: ${msg}. Scenario chat may not find this document.`,
      );
      return 0;
    }
  }

  private async extractAndPersistObligations(
    documentId: string,
    processing: DocumentProcessSummary,
  ): Promise<void> {
    try {
      const { documentExtractionService } = await import(
        "@/services/document-intelligence/extraction/document-extraction.service"
      );
      const payload = await documentExtractionService.extract(documentId);
      processing.detectedObligations = payload.obligations.map(toReviewable);
      processing.expectedInstallmentCount = payload.expectedInstallmentCount;
      processing.obligationsSaved = 0;
      if (payload.obligations.length === 0) {
        processing.warnings.push(
          "No payment schedule detected. Use Review payments to analyze again or add events manually on the Ledger.",
        );
      }
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Obligation extraction failed";
      processing.warnings.push(msg);
    }
  }
}

export const documentRepository = new DocumentRepository();
