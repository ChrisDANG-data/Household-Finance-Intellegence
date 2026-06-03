import { env } from "@/lib/env";
import { AppError } from "@/utils/errors";

const MODEL = "text-embedding-3-small";
/** Must match pgvector column in schema (all-MiniLM-L6-v2). */
export const OPENAI_EMBEDDING_DIMENSIONS = 384;

interface OpenAiEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
}

export function openAiEmbeddingsConfigured(): boolean {
  return Boolean(env.ai.openaiApiKey());
}

export async function embedBatchOpenAi(texts: string[]): Promise<number[][]> {
  const apiKey = env.ai.openaiApiKey();
  if (!apiKey) {
    throw new AppError("OPENAI_API_KEY is required for embeddings on Vercel", {
      code: "CONFIGURATION_ERROR",
      statusCode: 503,
    });
  }

  if (texts.length === 0) return [];

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: texts,
      dimensions: OPENAI_EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new AppError(`OpenAI embeddings failed: ${response.status} ${body}`, {
      code: "EMBEDDING_REQUEST_FAILED",
      statusCode: 502,
    });
  }

  const json = (await response.json()) as OpenAiEmbeddingResponse;
  const ordered = [...json.data].sort((a, b) => a.index - b.index);
  return ordered.map((row) => row.embedding);
}

export async function embedTextOpenAi(text: string): Promise<number[]> {
  const [vec] = await embedBatchOpenAi([text]);
  return vec ?? [];
}
