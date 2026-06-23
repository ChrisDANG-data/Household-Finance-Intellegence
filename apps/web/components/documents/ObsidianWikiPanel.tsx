"use client";

import { useState } from "react";
import { Download, Network, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  downloadObsidianVaultZip,
  syncObsidianWiki,
} from "@/lib/api/client";

export function ObsidianWikiPanel() {
  const [syncing, setSyncing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await syncObsidianWiki();
      setMessage(result.message);
      if (result.vaultSynced && result.vaultPath) {
        setMessage(`${result.message} Path: ${result.vaultPath}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    setMessage(null);
    try {
      await downloadObsidianVaultZip();
      setMessage(
        "Vault ZIP downloaded. Unzip and open the folder in Obsidian, then use Graph view.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Network className="size-4" />
          Obsidian visualization
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          FinIntel compiles linked markdown notes from your uploads and ledger.
          Open them in Obsidian for graph view — documents, categories, and
          events connected via wikilinks.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={syncing || downloading}
            onClick={() => void handleSync()}
          >
            <RefreshCw className="size-4" />
            {syncing ? "Syncing…" : "Sync local vault"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={syncing || downloading}
            onClick={() => void handleDownload()}
          >
            <Download className="size-4" />
            {downloading ? "Preparing…" : "Download vault ZIP"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Notes are written under{" "}
          <code className="rounded bg-muted px-1 py-0.5">Household/Documents/</code>{" "}
          in your vault — open{" "}
          <code className="rounded bg-muted px-1 py-0.5">Household/Household Index.md</code>{" "}
          in Obsidian. Local sync requires{" "}
          <code className="rounded bg-muted px-1 py-0.5">OBSIDIAN_VAULT_PATH</code>{" "}
          in <code className="rounded bg-muted px-1 py-0.5">apps/web/.env</code>.
          CLI fallback:{" "}
          <code className="rounded bg-muted px-1 py-0.5">npm run sync:household-wiki</code>{" "}
          from the repo root. ZIP export works on Vercel without a server path.
          Engineering notes (decisions, logs, chat code): run{" "}
          <code className="rounded bg-muted px-1 py-0.5">npm run sync:obsidian</code>{" "}
          from the repo root.
        </p>
        {message ? (
          <p className="text-sm text-primary" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
