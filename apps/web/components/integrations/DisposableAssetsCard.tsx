"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Wallet } from "lucide-react";

import { PlaidBankActions } from "@/components/integrations/PlaidBankActions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchDisposableAssets,
  syncDisposableAssets,
  type DisposableAssetsSummary,
} from "@/lib/api/client";

const DISPLAY_CURRENCY = "CAD";

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: DISPLAY_CURRENCY,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 2,
  }).format(amount);
}

function Row({
  label,
  amount,
  negative,
  muted,
  strong,
}: {
  label: string;
  amount: number;
  negative?: boolean;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className={muted ? "text-muted-foreground" : undefined}>{label}</span>
      <span
        className={`tabular-nums ${strong ? "font-semibold" : "font-medium"} ${
          negative ? "text-rose-600 dark:text-rose-400" : ""
        }`}
      >
        {negative && amount > 0 ? "−" : ""}
        {formatMoney(amount)}
      </span>
    </div>
  );
}

export interface DisposableAssetsCardProps {
  refreshKey?: number;
  onSynced?: () => void;
}

export function DisposableAssetsCard({
  refreshKey = 0,
  onSynced,
}: DisposableAssetsCardProps) {
  const [summary, setSummary] = useState<DisposableAssetsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDisposableAssets();
      setSummary(data);
      setError(null);
    } catch (err) {
      setSummary(null);
      setError(err instanceof Error ? err.message : "Could not load disposable assets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function runLiveSync() {
    setSyncing(true);
    setError(null);
    try {
      const data = await syncDisposableAssets();
      setSummary(data);
      onSynced?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Plaid sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="size-4" />
              Disposable assets
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Plaid assets plus this month&apos;s ledger income, minus expenses and
              investments (amounts shown in CAD).
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={syncing || loading}
            onClick={() => void runLiveSync()}
          >
            <RefreshCw className={`mr-2 size-4 ${syncing ? "animate-spin" : ""}`} />
            Sync live from Plaid
          </Button>
        </div>
        <PlaidBankActions
          refreshKey={refreshKey}
          onLinked={() => {
            void load();
            onSynced?.();
          }}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !summary && (
          <p className="text-sm text-muted-foreground">Loading summary…</p>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {summary && (
          <>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Disposable (estimate)
              </p>
              <p className="text-3xl font-semibold tracking-tight tabular-nums">
                {formatMoney(summary.disposable_total)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                As of{" "}
                {new Date(summary.as_of).toLocaleString("en-CA", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                · {summary.month}
                {summary.plaid_connected ? " · live from Plaid" : " · Plaid not linked"}
              </p>
            </div>

            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-4">
              <Row label="Checking" amount={summary.checking_total} />
              <Row label="Savings" amount={summary.savings_total} />
              <Row label="Cash management" amount={summary.cash_management_total} />
              <Row label="Investments (Plaid)" amount={summary.investment_total} />
              <Row label="Plaid assets total" amount={summary.plaid_assets_total} strong />
              <Row label="Credit owed" amount={summary.credit_owed} negative muted />
              <Row label="Income this month" amount={summary.month_income} />
              <Row label="Expenses this month" amount={summary.month_expenses} negative />
              <Row
                label="Investments this month"
                amount={summary.month_investment}
                negative
              />
            </div>

            {summary.mortgage_total > 0 && (
              <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Mortgage (informational — not in disposable)
                </p>
                <Row label="Total mortgage balance" amount={summary.mortgage_total} muted />
                {summary.mortgage_lines.map((line) => (
                  <Row key={line.account_id} label={line.name} amount={line.balance} muted />
                ))}
              </div>
            )}

            {summary.notes.length > 0 && (
              <ul className="list-inside list-disc text-xs text-muted-foreground">
                {summary.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
