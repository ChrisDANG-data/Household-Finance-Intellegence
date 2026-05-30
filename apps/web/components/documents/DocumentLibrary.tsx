import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentReviewButton } from "@/components/documents/DocumentReviewButton";
import type { SerializedDocument } from "@/lib/serializers";

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "COMPLETED":
      return "default";
    case "FAILED":
      return "destructive";
    default:
      return "secondary";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface DocumentLibraryProps {
  documents: SerializedDocument[];
}

export function DocumentLibrary({ documents }: DocumentLibraryProps) {
  if (documents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your documents</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No documents yet. Upload a PDF or image to extract and store raw
            text.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {documents.map((doc) => (
          <article
            key={doc.id}
            className="space-y-2 rounded-lg border border-border p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-medium">{doc.filename}</h3>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(doc.sizeBytes)} ·{" "}
                  {new Date(doc.createdAt).toLocaleString()}
                </p>
              </div>
              <Badge variant={statusVariant(doc.extractionStatus)}>
                {doc.extractionStatus}
              </Badge>
            </div>
            {doc.extractedText ? (
              <DocumentReviewButton
                documentId={doc.id}
                filename={doc.filename}
                hasExtractedText
              />
            ) : null}
            {doc.extractionError ? (
              <p className="text-xs text-destructive">{doc.extractionError}</p>
            ) : null}
            {doc.extractedText ? (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  View extracted text (
                  {doc.extractedText.length.toLocaleString()} chars)
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 font-mono text-xs">
                  {doc.extractedText}
                </pre>
              </details>
            ) : (
              <p className="text-xs text-muted-foreground">
                No extracted text available.
              </p>
            )}
          </article>
        ))}
      </CardContent>
    </Card>
  );
}
