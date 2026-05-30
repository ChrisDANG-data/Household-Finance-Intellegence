import type { DocumentRagQuery, DocumentRagResult } from "@/types/documents";
import { prisma } from "@/lib/prisma";
import { llmComplete } from "@/services/ai/llm/llm.service";
import type { AiProvider } from "@/services/ai/llm/types";
import { documentEmbeddingService } from "./embedding.service";

const DEFAULT_TOP_K = 5;

function vectorToSql(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

interface ChunkRow {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

/**
 * Document Intelligence Engine — semantic retrieval over document chunks.
 * Uses local embeddings for vector search and Claude or Gemini for answer generation.
 */
export class DocumentRagService {
  /**
   * Retrieve the most relevant chunks for a query using vector similarity.
   */
  async retrieve(query: DocumentRagQuery): Promise<DocumentRagResult> {
    const topK = query.topK ?? DEFAULT_TOP_K;
    const queryEmbedding = await documentEmbeddingService.embedText(query.query);
    const vecSql = vectorToSql(queryEmbedding);

    const results = await prisma.$queryRawUnsafe<ChunkRow[]>(
      `SELECT id, document_id, chunk_index, content, metadata,
              1 - (embedding <=> $1::vector) AS similarity
       FROM document_chunks
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      vecSql,
      topK,
    );

    return {
      chunks: results.map((row) => ({
        content: row.content,
        score: Number(row.similarity),
        documentId: row.document_id,
        metadata: row.metadata,
      })),
    };
  }

  /**
   * Full RAG: retrieve relevant chunks then ask Claude to answer based on them.
   */
  async ask(
    question: string,
    options: { topK?: number; provider?: AiProvider } = {},
  ): Promise<{ answer: string; sources: DocumentRagResult["chunks"] }> {
    const ragResult = await this.retrieve({
      query: question,
      householdId: "default",
      topK: options.topK ?? DEFAULT_TOP_K,
    });

    if (ragResult.chunks.length === 0) {
      return {
        answer:
          "No relevant documents found. Please upload and index your documents first.",
        sources: [],
      };
    }

    const context = ragResult.chunks
      .map(
        (chunk, i) =>
          `[Source ${i + 1} | score: ${chunk.score.toFixed(3)}]\n${chunk.content}`,
      )
      .join("\n\n---\n\n");

    const { text: answer } = await llmComplete({
      provider: options.provider,
      maxTokens: 150,
      temperature: 0,
      caller: "document-rag",
      system: `You are a concise financial document assistant. Answer from the provided context (document excerpts and/or financial obligations database).

STRICT OUTPUT RULES:
- Answer with ONLY the specific information asked for — nothing else
- If asked for a policy number, return ONLY the policy number
- If asked for a payment amount, return ONLY: type, company/name, and amount
- If asked for a date, return ONLY the date
- If asked about a fee for a specific month, check if the obligation is active in that period and calculate from the frequency (bi-weekly = ~2.17 payments/month)
- Do NOT add explanations, disclaimers, or extra context
- Do NOT repeat the question
- If the answer is not in the provided context, say "Not found."
- Keep response under 50 words unless multiple items are requested`,
      user: `Context from uploaded documents:\n\n${context}\n\n---\n\nQuestion: ${question}`,
    });

    return { answer, sources: ragResult.chunks };
  }

  /**
   * Index a document for RAG (delegates to embedding service).
   */
  async indexDocument(documentId: string): Promise<void> {
    await documentEmbeddingService.indexDocument(documentId);
  }
}

export const documentRagService = new DocumentRagService();
