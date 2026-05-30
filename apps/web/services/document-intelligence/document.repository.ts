import { ExtractionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { saveDocumentFile } from "@/lib/storage/local-document-storage";
import { serializeDocument, type SerializedDocument } from "@/lib/serializers";
import { textExtractionService } from "@/services/document-intelligence/extraction/text-extraction.service";
import type { DocumentMimeType } from "@/types/documents";
import { documentUploadService } from "@/services/document-intelligence/upload/document-upload.service";
import { AppError } from "@/utils/errors";
import { env } from "@/lib/env";
import { bytesToMegabytes } from "@/utils/file";

export interface UploadDocumentInput {
  filename: string;
  mimeType: DocumentMimeType;
  buffer: Buffer;
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

  async upload(input: UploadDocumentInput): Promise<SerializedDocument> {
    const sizeBytes = input.buffer.length;
    documentUploadService.validateMimeType(input.mimeType);

    const maxMb = env.upload.maxSizeMb;
    if (bytesToMegabytes(sizeBytes) > maxMb) {
      throw new AppError(`File exceeds ${maxMb} MB limit`, {
        code: "FILE_TOO_LARGE",
        statusCode: 400,
      });
    }

    const doc = await prisma.document.create({
      data: {
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes,
        storagePath: "pending",
        extractionStatus: ExtractionStatus.PENDING,
      },
    });

    const storagePath = await saveDocumentFile(
      doc.id,
      input.filename,
      input.buffer,
    );

    await prisma.document.update({
      where: { id: doc.id },
      data: { storagePath },
    });

    return this.runExtraction(doc.id);
  }

  async runExtraction(documentId: string): Promise<SerializedDocument> {
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) {
      throw new AppError("Document not found", {
        code: "NOT_FOUND",
        statusCode: 404,
      });
    }

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

      // Obligations are extracted on demand via /api/documents/extraction
      // after the user reviews and confirms in the UI.

      return serializeDocument(updated);
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
      return serializeDocument(updated);
    }
  }
}

export const documentRepository = new DocumentRepository();
