"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteObligation } from "@/lib/api/client";
import type { SerializedObligation } from "@/lib/serializers";
import type { MonthlyObligationSummary } from "@/services/financial-state/obligation-summary";

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

interface ObligationDashboardProps {
  initialObligations: SerializedObligation[];
  initialSummary: MonthlyObligationSummary;
  month: string;
}

export function ObligationDashboard({
  initialObligations,
  initialSummary,
  month,
}: ObligationDashboardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const obligations = initialObligations;
  const summary = initialSummary;

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this obligation?")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteObligation(id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Total obligation outflow for{" "}
            <span className="font-mono text-foreground">{month}</span>{" "}
            (deterministic projection from stored obligations).
          </p>
          <p className="text-3xl font-semibold tracking-tight">
            {formatMoney(summary.total_monthly_obligations, "CAD")}
          </p>
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <span>{summary.obligation_count} stored</span>
            <span>·</span>
            <span>{summary.active_obligation_ids.length} active this month</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Obligations (from documents)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <p className="text-sm text-destructive" role="alert">{error}</p>
          )}
          {obligations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No obligations yet. Upload a document to extract payment obligations automatically.
            </p>
          ) : (
            obligations.map((o) => (
              <div
                key={o.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-4"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{o.name}</h3>
                    <Badge variant="outline">{o.frequency}</Badge>
                    {summary.active_obligation_ids.includes(o.id) ? (
                      <Badge variant="secondary">Active {month}</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {o.category} · {formatMoney(o.amount, o.currency)} · starts{" "}
                    {o.startDate}
                    {o.endDate ? ` · ends ${o.endDate}` : ""}
                  </p>
                  {o.notes ? (
                    <p className="text-xs text-muted-foreground">{o.notes}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={busy}
                    aria-label={`Delete ${o.name}`}
                    onClick={() => void handleDelete(o.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
