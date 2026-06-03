import type { FeatureExtractionPipeline } from "@xenova/transformers";

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

let embeddingPipeline: FeatureExtractionPipeline | null = null;

async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
  if (!embeddingPipeline) {
    const { pipeline } = await import("@xenova/transformers");
    embeddingPipeline = await pipeline("feature-extraction", MODEL_NAME, {
      quantized: true,
    });
  }
  return embeddingPipeline;
}

export async function embedTextLocal(text: string): Promise<number[]> {
  const pipe = await getEmbeddingPipeline();
  const output = await pipe(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

export async function embedBatchLocal(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    results.push(await embedTextLocal(text));
  }
  return results;
}
