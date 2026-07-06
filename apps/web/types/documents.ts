import type { SerializedDocument } from "@/lib/serializers";

export type DocumentMimeType =
  | "application/pdf"
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/tiff";

export interface DocumentUploadPayload {
  filename: string;
  mimeType: DocumentMimeType;
  sizeBytes: number;
  householdId?: string;
}

export interface StoredDocumentRef {
  id: string;
  storageKey: string;
  mimeType: DocumentMimeType;
  createdAt: Date;
}

export interface DocumentUploadResult {
  document: StoredDocumentRef;
  /** Set when OCR/extraction pipeline is queued */
  processingJobId?: string;
}

export interface EmbeddingRecord {
  id: string;
  documentId: string;
  chunkIndex: number;
  vector: number[];
  metadata?: Record<string, unknown>;
}

export interface DocumentRagQuery {
  query: string;
  householdId?: string;
  userId?: string;
  topK?: number;
  filters?: Record<string, unknown>;
}

export interface DocumentRagResult {
  chunks: Array<{
    content: string;
    score: number;
    documentId: string;
    metadata?: Record<string, unknown>;
  }>;
}

/** Obligation proposed by document extraction, editable before ledger insert. */
export interface ReviewableObligation {
  name: string;
  category: string;
  amount: number;
  currency: string;
  frequency: string;
  startDate: string;
  endDate?: string | null;
  notes?: string | null;
}

export interface ExtractionPreviewResult {
  documentId: string;
  obligations: ReviewableObligation[];
  /** Parsed from contract (e.g. 4 quarterly steps); omit when unknown. */
  expectedInstallmentCount?: number | null;
  message: string;
}

export interface ExtractionConfirmResult {
  documentId: string;
  savedToDb: number;
  message: string;
}

/** Returned after upload + full document intelligence pipeline. */
export interface DocumentUploadResponse {
  document: SerializedDocument;
  chunksIndexed: number;
  wikiPagesWritten: number;
  obsidianVaultSynced: boolean;
  obligationsSaved: number;
  detectedObligations: ReviewableObligation[];
  expectedInstallmentCount?: number | null;
  warnings: string[];
}

export interface ObsidianWikiSyncResult {
  pageCount: number;
  documentCount: number;
  categoryCount: number;
  eventCount: number;
  vaultSynced: boolean;
  vaultPath: string | null;
  message: string;
}
