import { resolveRequestUserId } from "@/lib/auth/request-user";
import { EngineModuleLayout } from "@/components/EngineModuleLayout";
import { DocumentLibrary } from "@/components/documents/DocumentLibrary";
import { DocumentUploadPanel } from "@/components/documents/DocumentUploadPanel";
import { ObsidianWikiPanel } from "@/components/documents/ObsidianWikiPanel";
import { DbSetupNotice } from "@/components/ui/DbSetupNotice";
import { documentRepository } from "@/services/document-intelligence/document.repository";

export const dynamic = "force-dynamic";

export default async function DocumentsEnginePage() {
  let documents: Awaited<ReturnType<typeof documentRepository.list>> = [];
  let dbError: string | null = null;

  try {
    const userId = await resolveRequestUserId();
    documents = await documentRepository.list(userId);
  } catch (error) {
    dbError =
      error instanceof Error
        ? error.message
        : "Could not connect to the database.";
  }

  return (
    <EngineModuleLayout
      wide
      title="Document Intelligence"
      subtitle="Upload PDFs and images. Text is extracted, indexed for AI Q&A, and compiled into an Obsidian wiki for graph visualization."
    >
      {dbError ? <DbSetupNotice message={dbError} /> : null}
      <DocumentUploadPanel />
      {!dbError ? <ObsidianWikiPanel /> : null}
      {!dbError ? <DocumentLibrary documents={documents} /> : null}
    </EngineModuleLayout>
  );
}
