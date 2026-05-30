"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SerializedFinancialEvent } from "@/lib/serializers/financial-state";
import {
  FINANCIAL_EVENT_OWNERS,
  OWNER_LABELS,
  type FinancialEventOwner,
} from "@/services/financial-state/types";

type EventType = "income" | "recurring_expense" | "investment";
type Frequency = "monthly" | "weekly" | "yearly" | "quarterly" | "one_time";

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "weekly", label: "Weekly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
  { value: "one_time", label: "One-time" },
];

interface FormState {
  type: EventType;
  category: string;
  amount: string;
  currency: string;
  frequency: Frequency;
  owner: FinancialEventOwner;
  startDate: string;
  endDate: string;
  accountIn: string;
  accountOut: string;
  notes: string;
}

function emptyForm(): FormState {
  return {
    type: "income",
    category: "",
    amount: "",
    currency: "CAD",
    frequency: "monthly",
    owner: "partner_a",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    accountIn: "",
    accountOut: "",
    notes: "",
  };
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function FinancialEventForm() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [events, setEvents] = useState<SerializedFinancialEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/financial-state/events");
      const json = await res.json();
      if (json.success) {
        setEvents(json.data.events);
      }
    } catch {
      /* events list is best-effort */
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/financial-state/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          category: form.category,
          amount: Number(form.amount),
          currency: form.currency,
          frequency: form.frequency,
          owner: form.owner,
          start_date: form.startDate,
          end_date: form.endDate || null,
          account_in: form.accountIn || null,
          account_out: form.accountOut || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Server responded with ${res.status}`);
      }

      setSuccess("Event saved successfully.");
      setForm(emptyForm());
      await fetchEvents();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this financial event?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/financial-state/events/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      await fetchEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  const selectClasses =
    "flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <div className="space-y-6">
      {/* ── Form ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add financial event</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            {/* Type radio */}
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-sm font-medium">Type</legend>
              <div className="flex gap-6">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="event-type"
                    value="income"
                    checked={form.type === "income"}
                    onChange={() => update("type", "income")}
                    className="accent-primary"
                  />
                  <ArrowUpCircle className="size-4 text-emerald-500" />
                  Income
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="event-type"
                    value="recurring_expense"
                    checked={form.type === "recurring_expense"}
                    onChange={() => update("type", "recurring_expense")}
                    className="accent-primary"
                  />
                  <ArrowDownCircle className="size-4 text-rose-500" />
                  Expense
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="event-type"
                    value="investment"
                    checked={form.type === "investment"}
                    onChange={() => update("type", "investment")}
                    className="accent-primary"
                  />
                  <ArrowDownCircle className="size-4 text-blue-500" />
                  Investment
                </label>
              </div>
            </fieldset>

            {/* Category */}
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium">Category</span>
              <Input
                required
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
                placeholder="salary, rent, insurance, utilities…"
              />
            </label>

            {/* Amount */}
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Amount</span>
              <Input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => update("amount", e.target.value)}
                placeholder="0.00"
              />
            </label>

            {/* Currency */}
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Currency</span>
              <Input
                value={form.currency}
                onChange={(e) => update("currency", e.target.value)}
                className="max-w-24"
              />
            </label>

            {/* Owner */}
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Owner</span>
              <select
                className={selectClasses}
                value={form.owner}
                onChange={(e) =>
                  update("owner", e.target.value as FinancialEventOwner)
                }
              >
                {FINANCIAL_EVENT_OWNERS.filter((o) => o !== "joint").map((o) => (
                  <option key={o} value={o}>
                    {OWNER_LABELS[o]}
                  </option>
                ))}
              </select>
            </label>

            {/* Frequency */}
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Frequency</span>
              <select
                className={selectClasses}
                value={form.frequency}
                onChange={(e) => update("frequency", e.target.value as Frequency)}
              >
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Start date */}
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Start date</span>
              <Input
                required
                type="date"
                value={form.startDate}
                onChange={(e) => update("startDate", e.target.value)}
              />
            </label>

            {/* End date */}
            <label className="space-y-1.5">
              <span className="text-sm font-medium">End date (optional)</span>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => update("endDate", e.target.value)}
              />
            </label>

            {/* Account In */}
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Account In</span>
              <Input
                value={form.accountIn}
                onChange={(e) => update("accountIn", e.target.value)}
                placeholder="e.g. TFSA, Checking"
              />
            </label>

            {/* Account Out */}
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Account Out</span>
              <Input
                value={form.accountOut}
                onChange={(e) => update("accountOut", e.target.value)}
                placeholder="e.g. Checking, Savings"
              />
            </label>

            {/* Notes */}
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium">Notes / description</span>
              <Textarea
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                rows={2}
                placeholder="Optional details…"
              />
            </label>

            {/* Status messages */}
            {error && (
              <p className="text-sm text-destructive sm:col-span-2" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p
                className="flex items-center gap-1.5 text-sm text-emerald-600 sm:col-span-2"
                role="status"
              >
                <CheckCircle2 className="size-4" />
                {success}
              </p>
            )}

            {/* Submit */}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                {busy ? "Saving…" : "Add event"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Event list ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recorded events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingEvents ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading events…
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No events yet. Use the form above to add income or expenses.
            </p>
          ) : (
            events.map((ev) => (
              <div
                key={ev.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-4"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {ev.type === "income" ? (
                      <ArrowUpCircle className="size-4 shrink-0 text-emerald-500" />
                    ) : ev.type === "investment" ? (
                      <ArrowDownCircle className="size-4 shrink-0 text-blue-500" />
                    ) : (
                      <ArrowDownCircle className="size-4 shrink-0 text-rose-500" />
                    )}
                    <h3 className="font-medium capitalize">{ev.category}</h3>
                    <Badge variant="outline">{ev.frequency}</Badge>
                    <Badge variant="outline">
                      {ev.owner === "joint" ? "Partner A + Partner B" : (OWNER_LABELS[ev.owner] ?? ev.owner)}
                    </Badge>
                    <Badge
                      variant={ev.type === "income" ? "secondary" : ev.type === "investment" ? "outline" : "destructive"}
                    >
                      {ev.type === "income" ? "Income" : ev.type === "investment" ? "Investment" : "Expense"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatMoney(ev.amount, ev.currency)} · starts {ev.start_date}
                    {ev.end_date ? ` · ends ${ev.end_date}` : ""}
                    {ev.account_in ? ` · In: ${ev.account_in}` : ""}
                    {ev.account_out ? ` · Out: ${ev.account_out}` : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  disabled={busy}
                  aria-label={`Delete ${ev.category} event`}
                  onClick={() => void handleDelete(ev.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
