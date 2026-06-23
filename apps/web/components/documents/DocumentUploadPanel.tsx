"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";

import { AiProviderSwitch } from "@/components/ai/AiProviderSwitch";
import { ObligationReviewDialog } from "@/components/documents/ObligationReviewDialog";
import { useAiProvider } from "@/hooks/use-ai-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  previewDocumentExtraction,
  uploadDocument,
} from "@/lib/api/client";
import type { ReviewableObligation } from "@/types/documents";

const ACCEPT =
  "application/pdf,image/png,image/jpeg,image/webp,image/tiff,.pdf,.png,.jpg,.jpeg,.webp,.tiff";

export function DocumentUploadPanel() {
  const router = useRouter();
  const { provider } = useAiProvider();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewDocId, setReviewDocId] = useState("");
  const [reviewFilename, setReviewFilename] = useState("");
  const [reviewObligations, setReviewObligations] = useState<
    ReviewableObligation[]
  >([]);
  const [reviewExpectedInstallments, setReviewExpectedInstallments] = useState<
    number | null
  >(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  async function openReview(documentId: string, filename: string) {
    setReviewDocId(documentId);
    setReviewFilename(filename);
    setReviewOpen(true);
    setReviewLoading(true);
    setReviewObligations([]);
    setReviewExpectedInstallments(null);
    try {
      const preview = await previewDocumentExtraction(documentId, provider);
      setReviewObligations(preview.obligations);
      setReviewExpectedInstallments(preview.expectedInstallmentCount ?? null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not analyze document",
      );
      setReviewOpen(false);
    } finally {
      setReviewLoading(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    setSavedMessage(null);
    try {
      const result = await uploadDocument(file);
      router.refresh();

      const parts: string[] = [];
      if (result.chunksIndexed > 0) {
        parts.push(`Indexed ${result.chunksIndexed} search chunk(s)`);
      }
      if (result.wikiPagesWritten > 0) {
        parts.push(
          result.obsidianVaultSynced
            ? `Updated Obsidian wiki (${result.wikiPagesWritten} notes) in Household/Documents/`
            : `Wiki compiled (${result.wikiPagesWritten} notes) but vault not written — click Sync local vault or run npm run sync:household-wiki`,
        );
      } else if (!result.obsidianVaultSynced) {
        parts.push(
          "Obsidian vault not updated — click Sync local vault or run npm run sync:household-wiki",
        );
      }
      if (result.detectedObligations.length > 0) {
        parts.push(
          `Found ${result.detectedObligations.length} payment(s) — confirm in the dialog to add to your ledger`,
        );
      }
      if (parts.length > 0) {
        setSavedMessage(parts.join(". ") + ".");
      }
      if (result.warnings.length > 0) {
        setError(result.warnings.join(" "));
      }

      if (result.detectedObligations.length > 0) {
        setReviewDocId(result.document.id);
        setReviewFilename(result.document.filename);
        setReviewObligations(result.detectedObligations);
        setReviewExpectedInstallments(result.expectedInstallmentCount ?? null);
        setReviewOpen(true);
        setReviewLoading(false);
      } else if (result.document.extractionStatus === "COMPLETED") {
        await openReview(result.document.id, result.document.filename);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload document</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            PDF or image (PNG, JPEG, WebP, TIFF). After upload we extract text,
            index chunks for AI Q&A, then open a review dialog so you can confirm
            payments before they are written to the ledger.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
            }}
          />
          <Button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-4" />
            {uploading ? "Uploading…" : "Choose file"}
          </Button>
          {savedMessage ? (
            <p className="text-sm text-primary" role="status">
              {savedMessage}
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <ObligationReviewDialog
        open={reviewOpen}
        documentId={reviewDocId}
        filename={reviewFilename}
        initialObligations={reviewObligations}
        expectedInstallmentCount={reviewExpectedInstallments}
        loading={reviewLoading}
        onClose={() => setReviewOpen(false)}
        onSaved={(count) => {
          setSavedMessage(
            count > 0
              ? `Added ${count} payment(s) to your ledger.`
              : "No payments were saved.",
          );
          router.refresh();
        }}
        aiProvider={provider}
      />
    </>
  );
}
