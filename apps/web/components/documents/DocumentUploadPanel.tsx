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
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  async function openReview(documentId: string, filename: string) {
    setReviewDocId(documentId);
    setReviewFilename(filename);
    setReviewOpen(true);
    setReviewLoading(true);
    setReviewObligations([]);
    try {
      const preview = await previewDocumentExtraction(documentId, provider);
      setReviewObligations(preview.obligations);
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
      const doc = await uploadDocument(file);
      router.refresh();
      await openReview(doc.id, doc.filename);
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
            PDF or image (PNG, JPEG, WebP, TIFF). Text is extracted automatically.
            You will review detected payments before they are added to your ledger.
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
