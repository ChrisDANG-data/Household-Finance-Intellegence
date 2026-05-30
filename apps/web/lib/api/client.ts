import type { AiProvider } from "@/lib/ai-provider";
import type { ApiResponse } from "@/types/api";
import type { SerializedDocument, SerializedObligation } from "@/lib/serializers";
import type {
  ExtractionConfirmResult,
  ExtractionPreviewResult,
  ReviewableObligation,
} from "@/types/documents";
import type { MonthlyObligationSummary } from "@/services/financial-state/obligation-summary";

async function parseApi<T>(response: Response): Promise<T> {
  const raw = await response.text();
  let body: ApiResponse<T>;
  try {
    body = JSON.parse(raw) as ApiResponse<T>;
  } catch {
    const hint =
      raw.trimStart().startsWith("<!DOCTYPE") || raw.trimStart().startsWith("<html")
        ? `Server returned HTML (${response.status}). Restart npm run dev and confirm the API route exists.`
        : `Invalid JSON response (${response.status}).`;
    throw new Error(hint);
  }
  if (!body.success) {
    throw new Error(body.error.message);
  }
  return body.data;
}

export async function fetchDocuments(): Promise<SerializedDocument[]> {
  const data = await parseApi<{ documents: SerializedDocument[] }>(
    await fetch("/api/documents/upload", { cache: "no-store" }),
  );
  return data.documents;
}

export async function uploadDocument(file: File): Promise<SerializedDocument> {
  const formData = new FormData();
  formData.append("file", file);
  const data = await parseApi<{ document: SerializedDocument }>(
    await fetch("/api/documents/upload", {
      method: "POST",
      body: formData,
    }),
  );
  return data.document;
}

export async function previewDocumentExtraction(
  documentId: string,
  aiProvider?: AiProvider,
): Promise<ExtractionPreviewResult> {
  return parseApi(
    await fetch("/api/documents/extraction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId,
        ...(aiProvider ? { ai_provider: aiProvider } : {}),
      }),
    }),
  );
}

export async function confirmDocumentExtraction(
  documentId: string,
  obligations: ReviewableObligation[],
  aiProvider?: AiProvider,
): Promise<ExtractionConfirmResult> {
  return parseApi(
    await fetch("/api/documents/extraction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId,
        confirm: true,
        obligations,
        replaceExisting: true,
        ...(aiProvider ? { ai_provider: aiProvider } : {}),
      }),
    }),
  );
}

export async function fetchObligations(month: string): Promise<{
  obligations: SerializedObligation[];
  summary: MonthlyObligationSummary;
}> {
  return parseApi(
    await fetch(`/api/obligations?month=${encodeURIComponent(month)}`, {
      cache: "no-store",
    }),
  );
}

export async function createObligation(
  input: Record<string, unknown>,
): Promise<SerializedObligation> {
  const data = await parseApi<{ obligation: SerializedObligation }>(
    await fetch("/api/obligations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  return data.obligation;
}

export async function updateObligation(
  id: string,
  input: Record<string, unknown>,
): Promise<SerializedObligation> {
  const data = await parseApi<{ obligation: SerializedObligation }>(
    await fetch(`/api/obligations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  return data.obligation;
}

export async function deleteObligation(id: string): Promise<void> {
  await parseApi(await fetch(`/api/obligations/${id}`, { method: "DELETE" }));
}

export interface PlaidConnectionStatus {
  connected: boolean;
  item_id: string | null;
  user_id: string;
  updated_at: string | null;
  plaid_configured: boolean;
}

export async function fetchPlaidStatus(): Promise<PlaidConnectionStatus> {
  return parseApi(
    await fetch("/api/integrations/plaid/status", { cache: "no-store" }),
  );
}

export async function createPlaidLinkToken(
  body: Record<string, unknown> = {},
): Promise<{ link_token: string; expiration: string; request_id: string }> {
  return parseApi(
    await fetch("/api/integrations/plaid/link-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function exchangePlaidPublicToken(
  publicToken: string,
): Promise<{
  item_id: string;
  request_id: string;
  balance_sync: {
    current_cash: number;
    account_count: number;
    item_id: string;
  } | null;
}> {
  return parseApi(
    await fetch("/api/integrations/plaid/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_token: publicToken, sync_balances: true }),
    }),
  );
}

export async function syncPlaidBalances(options?: {
  force?: boolean;
  scheduled?: boolean;
}): Promise<{
  current_cash: number;
  account_count: number;
  item_id: string;
  as_of: string;
  skipped: boolean;
  history: Array<{
    id: string;
    account_name: string;
    balance: number;
    balance_delta: number | null;
    snapshot_date: string;
  }>;
}> {
  return parseApi(
    await fetch("/api/integrations/plaid/balances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        force: options?.force ?? true,
        scheduled: options?.scheduled ?? false,
      }),
    }),
  );
}

export interface PlaidBalanceHistoryResponse {
  series: import("@/services/integrations/plaid/plaid-balance-history.service").PlaidBalanceChartSeries[];
  recent: import("@/services/integrations/plaid/plaid-balance-history.service").RecordedBalanceRow[];
}

export async function fetchPlaidBalanceHistory(): Promise<PlaidBalanceHistoryResponse> {
  return parseApi(
    await fetch("/api/integrations/plaid/history", { cache: "no-store" }),
  );
}
