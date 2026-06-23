"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Home,
  Lightbulb,
  MessageCircleQuestion,
  Sparkles,
  Workflow,
} from "lucide-react";

import {
  ChatResponseBody,
  HighlightedSummary,
} from "@/components/simulation/ChatResponseBody";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ChatResultData {
  question: string;
  data: {
    intent: string;
    interpretation: string;
    financial_summary: string;
    risk_level: string;
    explanation: string;
    recommendation: string;
    orchestrator_route?: string;
    agents_used?: string[];
    writer_summary?: string;
    detail_answer?: string;
    structured_data: {
      advice?: {
        key_insights: string[];
        recommendations: string[];
      };
    };
  };
}

const RISK_COLORS: Record<string, string> = {
  low: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  high: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
};

const ROUTE_STYLES: Record<string, { label: string; className: string }> = {
  deterministic_ledger: {
    label: "Deterministic ledger",
    className: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300",
  },
  langgraph: {
    label: "LangGraph multi-agent",
    className: "border-teal-500/30 bg-teal-500/10 text-teal-800 dark:text-teal-200",
  },
  ledger_llm: {
    label: "Ledger + LLM",
    className: "border-blue-500/30 bg-blue-500/10 text-blue-800 dark:text-blue-200",
  },
  advisor: {
    label: "Forecast advisor",
    className: "border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-200",
  },
};

const AGENT_COLORS: Record<string, string> = {
  cost: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  investment:
    "border-teal-500/30 bg-teal-500/10 text-teal-800 dark:text-teal-200",
  payments:
    "border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-200",
};

function splitAffordabilitySummary(explanation: string): {
  summary: string | null;
  body: string;
} {
  const marker = "### Affordability summary";
  const idx = explanation.indexOf(marker);
  if (idx === -1) {
    return { summary: null, body: explanation };
  }
  const afterSummary = explanation.slice(idx + marker.length);
  const nextSection = afterSummary.search(/\n### /);
  const summaryBlock =
    nextSection === -1
      ? explanation.slice(idx)
      : explanation.slice(idx, idx + marker.length + nextSection);
  const body =
    nextSection === -1
      ? ""
      : explanation.slice(idx + marker.length + nextSection).trim();
  return { summary: summaryBlock.trim(), body };
}

function AffordabilityBullets({ text }: { text: string }) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("-"));

  return (
    <ul className="space-y-2 text-sm">
      {lines.map((line) => (
        <li key={line} className="flex gap-2 leading-relaxed">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-emerald-500" />
          <span>{line.replace(/^- /, "")}</span>
        </li>
      ))}
    </ul>
  );
}

function EmptyResultState() {
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-lg flex-col items-center justify-center gap-5 px-4 pt-8 text-center sm:pt-10">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/60">
        <MessageCircleQuestion className="size-7 text-muted-foreground" />
      </div>
      <div>
        <p className="text-lg font-medium">No result found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask a question on the Forecast page first.
        </p>
      </div>
      <Link href="/simulation">
        <Button className="bg-gradient-to-r from-emerald-600 to-teal-600">
          Go to Forecast
        </Button>
      </Link>
    </div>
  );
}

export function ChatResultView() {
  const [result, setResult] = useState<ChatResultData | null | undefined>(
    undefined,
  );

  useEffect(() => {
    const raw = sessionStorage.getItem("chat_result");
    if (raw) {
      try {
        setResult(JSON.parse(raw) as ChatResultData);
      } catch {
        setResult(null);
      }
    } else {
      setResult(null);
    }
  }, []);

  if (result === undefined) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-lg flex-col items-center justify-center gap-3 px-4 pt-8 text-center sm:pt-10">
        <div className="size-8 animate-pulse rounded-full bg-muted" />
        <p className="text-sm text-muted-foreground">Loading result…</p>
      </div>
    );
  }

  if (!result) {
    return <EmptyResultState />;
  }

  const { question, data } = result;
  const writerSummary = data.writer_summary?.trim();
  const detailAnswer =
    data.detail_answer?.trim() ||
    (writerSummary ? data.explanation.replace(writerSummary, "").trim() : "");
  const detailSource = detailAnswer || data.explanation;
  const { summary: affordSummary, body: affordBody } = splitAffordabilitySummary(
    detailSource,
  );
  const responseBody = affordSummary ? affordBody : detailSource;
  const recommendations = data.structured_data.advice?.recommendations ?? [];
  const routeStyle = data.orchestrator_route
    ? ROUTE_STYLES[data.orchestrator_route]
    : null;

  return (
    <div className="relative min-h-screen pb-16 pt-8 sm:pt-10">
      <div className="mx-auto max-w-3xl space-y-6 px-4 sm:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/simulation">
            <Button variant="outline" size="sm" className="rounded-full">
              <ArrowLeft className="mr-1.5 size-4" />
              Forecast
            </Button>
          </Link>
          <Link href="/">
            <Button variant="ghost" size="sm" className="rounded-full">
              <Home className="mr-1.5 size-4" />
              Home
            </Button>
          </Link>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Financial Q&A
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Your answer
          </h1>
        </div>

        <Card className="glass-card overflow-hidden rounded-2xl border-emerald-500/20 shadow-lg">
          <CardHeader className="border-b border-border/50 bg-gradient-to-r from-emerald-500/8 to-transparent pb-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <MessageCircleQuestion className="size-4" />
              </span>
              <div>
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Your question
                </CardTitle>
                <p className="mt-2 text-lg font-medium leading-snug sm:text-xl">
                  {question}
                </p>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card className="glass-card glow-border overflow-hidden rounded-2xl shadow-xl">
          <CardHeader className="border-b border-border/50 bg-gradient-to-r from-emerald-500/12 via-teal-500/8 to-cyan-500/5 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25">
                <Sparkles className="size-4" />
              </span>
              <CardTitle className="text-base font-semibold">AI Response</CardTitle>
              <Badge
                variant="outline"
                className={RISK_COLORS[data.risk_level] ?? ""}
              >
                {data.risk_level} risk
              </Badge>
              {routeStyle ? (
                <Badge variant="outline" className={routeStyle.className}>
                  <Workflow className="mr-1 size-3" />
                  {routeStyle.label}
                </Badge>
              ) : null}
              {data.agents_used?.map((agent) => (
                <Badge
                  key={agent}
                  variant="outline"
                  className={AGENT_COLORS[agent] ?? ""}
                >
                  <Bot className="mr-1 size-3" />
                  {agent}
                </Badge>
              ))}
            </div>
            {data.interpretation ? (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {data.interpretation}
              </p>
            ) : null}
          </CardHeader>

          <CardContent className="space-y-6 pt-6">
            {writerSummary ? (
              <div className="relative overflow-hidden rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/12 via-blue-500/5 to-transparent p-5 shadow-sm">
                <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-sky-400/10 blur-2xl" />
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-sky-900 dark:text-sky-100">
                  <Sparkles className="size-4" />
                  Summary
                </p>
                <HighlightedSummary text={writerSummary} />
              </div>
            ) : null}

            {writerSummary && responseBody ? (
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border/60" />
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Specialist details
                </p>
                <div className="h-px flex-1 bg-border/60" />
              </div>
            ) : null}

            {affordSummary && !writerSummary ? (
              <div className="rounded-2xl border border-emerald-500/35 bg-gradient-to-br from-emerald-500/12 to-teal-500/5 p-5 shadow-sm">
                <p className="mb-3 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                  Affordability summary
                </p>
                <AffordabilityBullets
                  text={affordSummary.replace(/^### Affordability summary\n?/, "")}
                />
              </div>
            ) : null}

            {!affordSummary && responseBody ? (
              <ChatResponseBody text={responseBody} />
            ) : null}
            {!affordSummary && !responseBody ? (
              <ChatResponseBody text={data.explanation} />
            ) : null}

            {data.recommendation ? (
              <div className="flex gap-3 rounded-2xl border border-border/50 bg-muted/30 p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300">
                  <Lightbulb className="size-4" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Recommendation
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed">
                    {data.recommendation}
                  </p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {recommendations.length > 0 ? (
          <Card className="glass-card rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Next steps</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {recommendations.map((item, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      {i + 1}.
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/simulation">
            <Button className="rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-6 shadow-lg shadow-emerald-500/20">
              <ArrowLeft className="mr-1.5 size-4" />
              Ask another question
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
