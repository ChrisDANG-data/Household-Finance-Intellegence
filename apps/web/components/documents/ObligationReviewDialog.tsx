"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AiProvider } from "@/lib/ai-provider";
import { confirmDocumentExtraction } from "@/lib/api/client";
import type { ReviewableObligation } from "@/types/documents";

const FREQUENCIES = [
  { value: "monthly", label: "Monthly" },
  { value: "weekly", label: "Weekly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
  { value: "one_time", label: "One-time" },
] as const;

function emptyRow(): ReviewableObligation {
  return {
    name: "",
    category: "",
    amount: 0,
    currency: "CAD",
    frequency: "monthly",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: null,
    notes: null,
  };
}

interface ObligationReviewDialogProps {
  open: boolean;
  documentId: string;
  filename: string;
  initialObligations: ReviewableObligation[];
  loading?: boolean;
  onClose: () => void;
  onSaved: (savedCount: number) => void;
  aiProvider?: AiProvider;
}

export function ObligationReviewDialog({
  open,
  documentId,
  filename,
  initialObligations,
  loading = false,
  onClose,
  onSaved,
  aiProvider,
}: ObligationReviewDialogProps) {
  const [rows, setRows] = useState<ReviewableObligation[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRows(
        initialObligations.length > 0 ? initialObligations : [emptyRow()],
      );
      setError(null);
    }
  }, [open, initialObligations]);

  if (!open) return null;

  function updateRow(index: number, patch: Partial<ReviewableObligation>) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleConfirm() {
    const valid = rows.filter((r) => r.category.trim() && Number(r.amount) > 0);
    if (valid.length === 0) {
      setError("Add at least one obligation with a category and amount.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await confirmDocumentExtraction(
        documentId,
        valid,
        aiProvider,
      );
      onSaved(result.savedToDb);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="obligation-review-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h2 id="obligation-review-title" className="text-lg font-semibold">
              Review detected payments
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              From <span className="font-medium text-foreground">{filename}</span>.
              Confirm or adjust before adding to your ledger.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              Analyzing document…
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Tip: use <strong>Quarterly</strong> for every-3-month schedules, or
                add multiple <strong>One-time</strong> rows for specific due dates
                (e.g. property tax Nov 1 and Feb 1).
              </p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2">Name</th>
                      <th className="px-2 py-2">Category</th>
                      <th className="px-2 py-2">Amount</th>
                      <th className="px-2 py-2">Freq</th>
                      <th className="px-2 py-2">Start date</th>
                      <th className="px-2 py-2">End date</th>
                      <th className="w-10 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={index} className="border-t border-border">
                        <td className="px-2 py-1.5">
                          <Input
                            value={row.name}
                            onChange={(e) =>
                              updateRow(index, { name: e.target.value })
                            }
                            placeholder="Vendor"
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={row.category}
                            onChange={(e) =>
                              updateRow(index, { category: e.target.value })
                            }
                            placeholder="property_tax"
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.amount || ""}
                            onChange={(e) =>
                              updateRow(index, {
                                amount: Number(e.target.value) || 0,
                              })
                            }
                            className="h-8 w-24 text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={row.frequency}
                            onChange={(e) =>
                              updateRow(index, { frequency: e.target.value })
                            }
                            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                          >
                            {FREQUENCIES.map((f) => (
                              <option key={f.value} value={f.value}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="date"
                            value={row.startDate}
                            onChange={(e) =>
                              updateRow(index, { startDate: e.target.value })
                            }
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="date"
                            value={row.endDate ?? ""}
                            onChange={(e) =>
                              updateRow(index, {
                                endDate: e.target.value || null,
                              })
                            }
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeRow(index)}
                            aria-label="Remove row"
                          >
                            <Trash2 className="size-3.5 text-muted-foreground" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRows((prev) => [...prev, emptyRow()])}
              >
                <Plus className="size-4" />
                Add payment
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Nothing is saved until you click Confirm.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Skip for now
            </Button>
            <Button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={saving || loading}
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Confirm & add to ledger"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
