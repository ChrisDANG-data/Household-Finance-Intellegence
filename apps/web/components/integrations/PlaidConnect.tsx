"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";
import { Landmark, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createPlaidLinkToken,
  exchangePlaidPublicToken,
  fetchPlaidStatus,
  syncPlaidBalances,
  type PlaidConnectionStatus,
} from "@/lib/api/client";

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(amount);
}

interface PlaidConnectProps {
  onSynced?: () => void;
}

export function PlaidConnect({ onSynced }: PlaidConnectProps = {}) {
  const router = useRouter();
  const [status, setStatus] = useState<PlaidConnectionStatus | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCash, setLastCash] = useState<number | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const s = await fetchPlaidStatus();
      setStatus(s);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Could not load Plaid status");
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const onSuccess = useCallback(
    async (publicToken: string) => {
      setBusy(true);
      setError(null);
      try {
        const result = await exchangePlaidPublicToken(publicToken);
        if (result.balance_sync?.current_cash != null) {
          setLastCash(result.balance_sync.current_cash);
        }
        setLinkToken(null);
        await loadStatus();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Link exchange failed");
      } finally {
        setBusy(false);
      }
    },
    [loadStatus, onSynced, router],
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
        client_user_id: "default",
        products: ["transactions"],
      });
      setLinkToken(link_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create link token");
    } finally {
      setBusy(false);
    }
  }

  async function refreshBalances() {
    setBusy(true);
    setError(null);
    try {
      const result = await syncPlaidBalances();
      setLastCash(result.current_cash);
      onSynced?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Balance sync failed");
    } finally {
      setBusy(false);
    }
  }

  const configured = status?.plaid_configured ?? false;
  const connected = status?.connected ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="size-4" />
          Bank connection (Plaid)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Link → exchange public token →{" "}
          <span className="font-mono text-xs">/accounts/balance/get</span> updates{" "}
          <span className="font-medium text-foreground">current cash</span>. Link
          products use <span className="font-mono text-xs">transactions</span> only
          (not the balance product).
        </p>

        {!configured && (
          <p className="text-sm text-amber-600 dark:text-amber-400" role="status">
            Set PLAID_CLIENT_ID and PLAID_SECRET in apps/web/.env, then restart the
            dev server.
          </p>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {connected && status?.item_id && (
          <p className="text-sm text-muted-foreground">
            Connected item{" "}
            <span className="font-mono text-foreground">{status.item_id}</span>
            {status.updated_at ? (
              <>
                {" "}
                · updated {new Date(status.updated_at).toLocaleString()}
              </>
            ) : null}
          </p>
        )}

        {lastCash != null && (
          <p className="text-lg font-semibold tracking-tight">
            Current cash: {formatMoney(lastCash)}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={!configured || busy}
            onClick={() => void startLink()}
          >
            {connected ? "Reconnect bank" : "Connect bank"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!connected || busy}
            onClick={() => void refreshBalances()}
          >
            <RefreshCw className="mr-2 size-4" />
            Refresh balances
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
