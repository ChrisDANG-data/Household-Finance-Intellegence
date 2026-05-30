export interface ChunkOptions {
  maxChunkSize?: number;
  overlapSize?: number;
}

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_OVERLAP = 200;

/**
 * Split text into overlapping chunks for embedding.
 * Tries to split on paragraph/sentence boundaries when possible.
 */
export function chunkText(
  text: string,
  options: ChunkOptions = {},
): string[] {
  const maxChunkSize = options.maxChunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlapSize = options.overlapSize ?? DEFAULT_OVERLAP;

  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChunkSize) return [cleaned];

  const paragraphs = cleaned.split(/\n{2,}/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    if (currentChunk.length + trimmed.length + 1 <= maxChunkSize) {
      currentChunk += (currentChunk ? "\n\n" : "") + trimmed;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
        const overlap = currentChunk.slice(-overlapSize);
        currentChunk = overlap + "\n\n" + trimmed;
      } else {
        currentChunk = trimmed;
      }

      while (currentChunk.length > maxChunkSize) {
        const splitPoint = findSplitPoint(currentChunk, maxChunkSize);
        chunks.push(currentChunk.slice(0, splitPoint).trim());
        const remaining = currentChunk.slice(splitPoint).trim();
        const overlap = currentChunk.slice(
          Math.max(0, splitPoint - overlapSize),
          splitPoint,
        );
        currentChunk = overlap + " " + remaining;
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter((c) => c.length > 0);
}

function findSplitPoint(text: string, maxLength: number): number {
  const sentenceEnd = text.lastIndexOf(". ", maxLength);
  if (sentenceEnd > maxLength * 0.5) return sentenceEnd + 2;

  const newline = text.lastIndexOf("\n", maxLength);
  if (newline > maxLength * 0.5) return newline + 1;

  const space = text.lastIndexOf(" ", maxLength);
  if (space > maxLength * 0.3) return space + 1;

  return maxLength;
}
