"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { ObligationReviewDialog } from "@/components/documents/ObligationReviewDialog";
import { useAiProvider } from "@/hooks/use-ai-provider";
import { Button } from "@/components/ui/button";
import { reanalyzeDocumentPayments } from "@/lib/api/client";
import type { ReviewableObligation } from "@/types/documents";

interface DocumentReanalyzeButtonProps {
  documentId: string;
  filename: string;
}

export function DocumentReanalyzeButton({
  documentId,
  filename,
}: DocumentReanalyzeButtonProps) {
  const router = useRouter();
  const { provider } = useAiProvider();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [obligations, setObligations] = useState<ReviewableObligation[]>([]);
  const [expectedInstallmentCount, setExpectedInstallmentCount] = useState<
    number | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  async function handleReanalyze() {
    setLoading(true);
    setError(null);
    try {
      const result = await reanalyzeDocumentPayments(documentId);
      setObligations(result.detectedObligations);
      setExpectedInstallmentCount(result.expectedInstallmentCount ?? null);
      setOpen(true);
      if (result.warnings.length > 0) {
        setError(result.warnings.join(" "));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => void handleReanalyze()}
      >
        <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        Re-detect payments
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <ObligationReviewDialog
        open={open}
        documentId={documentId}
        filename={filename}
        initialObligations={obligations}
        expectedInstallmentCount={expectedInstallmentCount}
        loading={loading && obligations.length === 0}
        onClose={() => setOpen(false)}
        onSaved={() => router.refresh()}
        aiProvider={provider}
      />
    </>
  );
}
