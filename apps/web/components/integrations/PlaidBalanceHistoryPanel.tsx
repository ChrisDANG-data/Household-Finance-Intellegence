"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { DisposableAssetsCard } from "@/components/integrations/DisposableAssetsCard";
import { PlaidBalanceLineChart } from "@/components/integrations/PlaidBalanceLineChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchPlaidBalanceHistory,
  syncPlaidBalances,
  type PlaidBalanceHistoryResponse,
} from "@/lib/api/client";

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDelta(delta: number | null): string {
  if (delta == null) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${formatMoney(delta)}`;
}

export function PlaidBalanceHistoryPanel() {
  const router = useRouter();
  const [data, setData] = useState<PlaidBalanceHistoryResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disposableRefresh, setDisposableRefresh] = useState(0);

  const load = useCallback(async () => {
    try {
      const history = await fetchPlaidBalanceHistory();
      setData(history);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load history");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runSync(force = true) {
    setBusy(true);
    setError(null);
    try {
      await syncPlaidBalances({ force });
      await load();
      setDisposableRefresh((n) => n + 1);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <DisposableAssetsCard
        refreshKey={disposableRefresh}
        onSynced={() => {
          void load();
          setDisposableRefresh((n) => n + 1);
        }}
      />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Balance trends by account</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Stored separately from forecast. Each sync records balance, year, month,
              date, and change vs the previous reading for that account.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void runSync(true)}
          >
            <RefreshCw className="mr-2 size-4" />
            Sync now
          </Button>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <PlaidBalanceLineChart series={data?.series ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Snapshot history</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!data?.recent.length ? (
            <p className="text-sm text-muted-foreground">No snapshots stored yet.</p>
          ) : (
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Date</th>
                  <th className="pb-2 pr-3 font-medium">Year</th>
                  <th className="pb-2 pr-3 font-medium">Month</th>
                  <th className="pb-2 pr-3 font-medium">Account</th>
                  <th className="pb-2 pr-3 font-medium text-right">Balance</th>
                  <th className="pb-2 font-medium text-right">Δ vs last</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((row) => (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-mono text-xs">{row.snapshot_date}</td>
                    <td className="py-2 pr-3">{row.year}</td>
                    <td className="py-2 pr-3">{row.month}</td>
                    <td className="py-2 pr-3">{row.account_name}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatMoney(row.balance)}
                    </td>
                    <td
                      className={`py-2 text-right tabular-nums ${
                        row.balance_delta != null && row.balance_delta < 0
                          ? "text-rose-600 dark:text-rose-400"
                          : row.balance_delta != null && row.balance_delta > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : ""
                      }`}
                    >
                      {formatDelta(row.balance_delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
