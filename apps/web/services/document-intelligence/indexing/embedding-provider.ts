import { env } from "@/lib/env";
import { AppError } from "@/utils/errors";

import {
  embedBatchOpenAi,
  embedTextOpenAi,
  openAiEmbeddingsConfigured,
  OPENAI_EMBEDDING_DIMENSIONS,
} from "./embedding-openai";
import { embedBatchLocal, embedTextLocal } from "./embedding-local";

const LOCAL_DIMENSIONS = 384;

function explicitProvider(): "" | "openai" | "local" {
  const raw = process.env.EMBEDDING_PROVIDER?.trim().toLowerCase();
  if (raw === "openai") return "openai";
  if (raw === "local") return "local";
  return "";
}

/** Vercel serverless cannot load onnxruntime for @xenova/transformers. */
export function useOpenAiEmbeddings(): boolean {
  const explicit = explicitProvider();
  if (explicit === "openai") return true;
  if (explicit === "local") return false;
  if (process.env.VERCEL === "1") return openAiEmbeddingsConfigured();
  return false;
}

export function embeddingDimensions(): number {
  return useOpenAiEmbeddings() ? OPENAI_EMBEDDING_DIMENSIONS : LOCAL_DIMENSIONS;
}

export async function embedText(text: string): Promise<number[]> {
  if (useOpenAiEmbeddings()) {
    return embedTextOpenAi(text);
  }
  try {
    return await embedTextLocal(text);
  } catch (error) {
    if (openAiEmbeddingsConfigured()) {
      return embedTextOpenAi(text);
    }
    throw error;
  }
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (useOpenAiEmbeddings()) {
    return embedBatchOpenAi(texts);
  }
  try {
    return await embedBatchLocal(texts);
  } catch (error) {
    if (openAiEmbeddingsConfigured()) {
      return embedBatchOpenAi(texts);
    }
    const msg = error instanceof Error ? error.message : "Local embedding failed";
    throw new AppError(
      `${msg}. On Vercel set OPENAI_API_KEY or EMBEDDING_PROVIDER=openai.`,
      { code: "EMBEDDING_NOT_AVAILABLE", statusCode: 503 },
    );
  }
}
