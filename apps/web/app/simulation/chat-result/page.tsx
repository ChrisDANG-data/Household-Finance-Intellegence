"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Home, MessageCircleQuestion, Sparkles } from "lucide-react";

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

export default function ChatResultPage() {
  const [result, setResult] = useState<ChatResultData | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("chat_result");
    if (raw) {
      setResult(JSON.parse(raw));
    }
  }, []);

  if (!result) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center gap-4 px-4">
        <p className="text-muted-foreground">No result found.</p>
        <Link href="/simulation">
          <Button variant="outline">Back to Forecast</Button>
        </Link>
      </div>
    );
  }

  const { question, data } = result;
  const recommendations = data.structured_data.advice?.recommendations ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/simulation">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1.5 size-4" />
            Forecast Simulation
          </Button>
        </Link>
        <Link href="/">
          <Button variant="ghost" size="sm">
            <Home className="mr-1.5 size-4" />
            Home
          </Button>
        </Link>
      </div>

      <Card className="glass-card overflow-hidden border-emerald-500/20">
        <CardHeader className="border-b border-border/60 bg-muted/30 pb-4">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <MessageCircleQuestion className="size-5" />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Your question
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <p className="text-lg font-medium leading-snug">{question}</p>
        </CardContent>
      </Card>

      <Card className="glass-card glow-border overflow-hidden">
        <CardHeader className="border-b border-border/60 bg-gradient-to-r from-emerald-500/10 to-teal-500/5 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="size-5 text-emerald-600 dark:text-emerald-400" />
            <CardTitle className="text-base">AI Response</CardTitle>
            <Badge
              variant="outline"
              className={RISK_COLORS[data.risk_level] ?? ""}
            >
              {data.risk_level} risk
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-foreground">
            {data.explanation}
          </pre>

          {data.recommendation && (
            <div className="mt-6 rounded-xl border border-border/60 bg-muted/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recommendation
              </p>
              <p className="mt-2 text-sm">{data.recommendation}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {recommendations.length > 0 && (
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Next steps</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-4 text-sm text-muted-foreground">
              {recommendations.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-3 pt-4">
        <Link href="/simulation">
          <Button className="bg-gradient-to-r from-emerald-600 to-teal-600">
            <ArrowLeft className="mr-1.5 size-4" />
            Back to Forecast
          </Button>
        </Link>
        <Link href="/">
          <Button variant="outline">
            <Home className="mr-1.5 size-4" />
            Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
