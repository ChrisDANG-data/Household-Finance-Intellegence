"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";

import { Button } from "@/components/ui/button";
import {
  createPlaidLinkToken,
  exchangePlaidPublicToken,
  fetchPlaidStatus,
  type PlaidConnectionStatus,
} from "@/lib/api/client";

interface PlaidBankActionsProps {
  onLinked?: () => void;
  /** Bump after balance sync so last-synced time refreshes */
  refreshKey?: number;
}

function formatSyncTime(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function PlaidBankActions({ onLinked, refreshKey = 0 }: PlaidBankActionsProps) {
  const router = useRouter();
  const [status, setStatus] = useState<PlaidConnectionStatus | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await fetchPlaidStatus());
      setError(null);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Could not load bank status");
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus, refreshKey]);

  const onSuccess = useCallback(
    async (publicToken: string) => {
      setBusy(true);
      setError(null);
      try {
        await exchangePlaidPublicToken(publicToken);
        setLinkToken(null);
        await loadStatus();
        onLinked?.();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Reconnect failed");
      } finally {
        setBusy(false);
      }
    },
    [loadStatus, onLinked, router],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (public_token) => {
      void onSuccess(public_token);
    },
    onExit: () => setLinkToken(null),
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  async function startLink() {
    setBusy(true);
    setError(null);
    try {
      const { link_token } = await createPlaidLinkToken({
        products: ["transactions"],
      });
      setLinkToken(link_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open Plaid Link");
    } finally {
      setBusy(false);
    }
  }

  const configured = status?.plaid_configured ?? false;
  const connected = status?.connected ?? false;
  const syncLabel = status?.last_synced_at
    ? formatSyncTime(status.last_synced_at)
    : status?.linked_at
      ? formatSyncTime(status.linked_at)
      : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {connected && syncLabel && (
        <span className="text-muted-foreground">
          {status?.last_synced_at
            ? `Balances synced ${syncLabel}`
            : `Bank linked ${syncLabel} · sync to refresh`}
        </span>
      )}
      {!connected && configured && (
        <span className="text-muted-foreground">No bank linked</span>
      )}
      {!configured && (
        <span className="text-amber-600 dark:text-amber-400">
          Set PLAID_CLIENT_ID and PLAID_SECRET in .env
        </span>
      )}
      <Button
        type="button"
        disabled={!configured || busy}
        onClick={() => void startLink()}
      >
        {connected ? "Reconnect bank" : "Connect bank"}
      </Button>
      {error && (
        <span className="text-destructive" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
