import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  FileText,
  Shield,
  Sparkles,
  Wallet,
  Zap,
} from "lucide-react";

import { EngineModuleCard } from "@/components/EngineModuleCard";
import { Button } from "@/components/ui/button";

const ENGINES = [
  {
    name: "Document Intelligence",
    href: "/documents",
    apiPath: "/api/documents/upload",
    description: "Upload contracts & receipts. OCR, extract obligations, RAG search.",
    icon: FileText,
    gradient: "from-violet-500/20 to-purple-600/10",
    iconColor: "text-violet-600 dark:text-violet-400",
  },
  {
    name: "Financial State",
    href: "/ledger",
    apiPath: "/api/financial-state/events",
    description: "Your canonical ledger — income, expenses, investments.",
    icon: Wallet,
    gradient: "from-amber-500/20 to-orange-600/10",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  {
    name: "Forecast Simulation",
    href: "/simulation",
    apiPath: "/api/simulation/forecast",
    description: "6-month cash-flow charts, what-if scenarios, AI Q&A.",
    icon: BarChart3,
    gradient: "from-emerald-500/20 to-teal-600/10",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    featured: true,
  },
] as const;

const FEATURES = [
  {
    icon: Shield,
    title: "Deterministic math",
    text: "Forecasts run on your data — not guessed by AI.",
  },
  {
    icon: Sparkles,
    title: "AI explanations",
    text: "Ask natural-language questions about expenses & contracts.",
  },
  {
    icon: Zap,
    title: "Document → ledger",
    text: "Upload a PDF; obligations flow into your financial events.",
  },
] as const;

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      {/* Hero */}
      <section className="relative mb-16 overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-emerald-500/5 p-8 sm:p-12 glow-border">
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative max-w-2xl">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <Sparkles className="size-3.5" />
            AI-powered household finance
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Know your cash flow.
            <br />
            <span className="gradient-text">Plan with confidence.</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            Upload documents, build your ledger, run deterministic forecasts,
            and ask AI about your finances — all in one place.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              size="lg"
              className="bg-gradient-to-r from-emerald-600 to-teal-600 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40"
              render={<Link href="/simulation" />}
              nativeButton={false}
            >
              Open Forecast &amp; AI
              <ArrowRight className="size-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              render={<Link href="/documents" />}
              nativeButton={false}
            >
              Upload documents
            </Button>
          </div>
        </div>
      </section>

      {/* Feature pills */}
      <section className="mb-14 grid gap-4 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div
            key={title}
            className="glass-card flex gap-4 rounded-2xl p-5 transition hover:border-emerald-500/30"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Icon className="size-5" />
            </span>
            <div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Engine modules */}
      <section>
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Modules</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Three engines — documents, ledger, forecast
            </p>
          </div>
        </div>
        <ul className="grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {ENGINES.map((engine) => (
            <li key={engine.name} className={engine.featured ? "sm:col-span-2 lg:col-span-1" : ""}>
              <EngineModuleCard {...engine} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
