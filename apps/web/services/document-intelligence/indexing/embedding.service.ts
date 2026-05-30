import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

import type { EmbeddingRecord } from "@/types/documents";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/utils/errors";
import { chunkText } from "@/utils/chunking";

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
const EMBEDDING_DIMENSIONS = 384;

let embeddingPipeline: FeatureExtractionPipeline | null = null;

async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
  if (!embeddingPipeline) {
    embeddingPipeline = await pipeline("feature-extraction", MODEL_NAME, {
      quantized: true,
    });
  }
  return embeddingPipeline;
}

function vectorToSql(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/**
 * Document Intelligence Engine — vector indexing for retrieval.
 * Uses local all-MiniLM-L6-v2 model (384 dimensions, no API key required).
 */
export class DocumentEmbeddingService {
  get dimensions(): number {
    return EMBEDDING_DIMENSIONS;
  }

  async embedText(text: string): Promise<number[]> {
    const pipe = await getEmbeddingPipeline();
    const output = await pipe(text, { pooling: "mean", normalize: true });
    return Array.from(output.data as Float32Array);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const pipe = await getEmbeddingPipeline();
    const results: number[][] = [];

    for (const text of texts) {
      const output = await pipe(text, { pooling: "mean", normalize: true });
      results.push(Array.from(output.data as Float32Array));
    }

    return results;
  }

  async embedDocumentChunks(
    documentId: string,
    chunks: string[],
  ): Promise<EmbeddingRecord[]> {
    const embeddings = await this.embedBatch(chunks);

    await prisma.$executeRawUnsafe(
      `DELETE FROM document_chunks WHERE document_id = $1`,
      documentId,
    );

    const records: EmbeddingRecord[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const id = `${documentId}_chunk_${i}`;
      const vecSql = vectorToSql(embeddings[i]);

      await prisma.$executeRawUnsafe(
        `INSERT INTO document_chunks (id, document_id, chunk_index, content, embedding, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5::vector, $6::jsonb, NOW())`,
        id,
        documentId,
        i,
        chunks[i],
        vecSql,
        JSON.stringify({ charCount: chunks[i].length }),
      );

      records.push({
        id,
        documentId,
        chunkIndex: i,
        vector: embeddings[i],
        metadata: { charCount: chunks[i].length },
      });
    }

    return records;
  }

  /**
   * Full pipeline: chunk extracted text from a document and embed all chunks.
   */
  async indexDocument(documentId: string): Promise<EmbeddingRecord[]> {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { extractedText: true, extractionStatus: true },
    });

    if (!doc) {
      throw new AppError("Document not found", {
        code: "NOT_FOUND",
        statusCode: 404,
      });
    }

    if (!doc.extractedText) {
      throw new AppError(
        "Document has no extracted text. Upload and extract text first.",
        { code: "PRECONDITION_FAILED", statusCode: 400 },
      );
    }

    const chunks = chunkText(doc.extractedText);
    if (chunks.length === 0) {
      throw new AppError("Document text produced no valid chunks", {
        code: "PRECONDITION_FAILED",
        statusCode: 400,
      });
    }

    return this.embedDocumentChunks(documentId, chunks);
  }
}

export const documentEmbeddingService = new DocumentEmbeddingService();
