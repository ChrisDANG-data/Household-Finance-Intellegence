"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileSearch } from "lucide-react";

import { ObligationReviewDialog } from "@/components/documents/ObligationReviewDialog";
import { useAiProvider } from "@/hooks/use-ai-provider";
import { Button } from "@/components/ui/button";
import { previewDocumentExtraction } from "@/lib/api/client";
import type { ReviewableObligation } from "@/types/documents";

interface DocumentReviewButtonProps {
  documentId: string;
  filename: string;
  hasExtractedText: boolean;
}

export function DocumentReviewButton({
  documentId,
  filename,
  hasExtractedText,
}: DocumentReviewButtonProps) {
  const router = useRouter();
  const { provider } = useAiProvider();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [obligations, setObligations] = useState<ReviewableObligation[]>([]);
  const [expectedInstallmentCount, setExpectedInstallmentCount] = useState<
    number | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  if (!hasExtractedText) return null;

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setObligations([]);
    setExpectedInstallmentCount(null);
    try {
      const preview = await previewDocumentExtraction(documentId, provider);
      setObligations(preview.obligations);
      setExpectedInstallmentCount(preview.expectedInstallmentCount ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setOpen(false);
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
        onClick={() => void handleOpen()}
      >
        <FileSearch className="size-4" />
        Review payments
      </Button>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : null}
      <ObligationReviewDialog
        open={open}
        documentId={documentId}
        filename={filename}
        initialObligations={obligations}
        expectedInstallmentCount={expectedInstallmentCount}
        loading={loading}
        onClose={() => setOpen(false)}
        onSaved={() => router.refresh()}
        aiProvider={provider}
      />
    </>
  );
}
