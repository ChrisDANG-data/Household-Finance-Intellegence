"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Loader2, SendHorizonal, Sparkles } from "lucide-react";

import { TimelineChart } from "@/components/financial/TimelineChart";
import { InsightsPanel } from "@/components/scenario/InsightsPanel";
import { RiskSummaryCard } from "@/components/scenario/RiskSummaryCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { GoogleVoiceAskButton } from "@/components/ai/GoogleVoiceAskButton";
import { AiProviderSwitch } from "@/components/ai/AiProviderSwitch";
import { useAiProvider } from "@/hooks/use-ai-provider";
import { DEMO_FINANCIAL_CONTEXT } from "@/lib/demo-financial-context";
import type { SerializedScenarioChatResponse } from "@/lib/serialize-scenario-response";
import { streamScenarioResponse } from "@/services/chat/scenarioClient";
import type { AssistantChatMessage, ChatMessage } from "@/services/chat/types";
import { cn } from "@/lib/utils";

const SUGGESTED_PROMPTS = [
  "Can I afford a $3000 vacation in August?",
  "What if my income drops by 20%?",
  "What is the termination date for my insurance?",
  "What are the payment terms in my contract?",
];

function createId(): string {
  return crypto.randomUUID();
}

function AssistantMessageBody({
  message,
}: {
  message: AssistantChatMessage;
}) {
  const data = message.response;
  const isDocumentAnswer =
    data?.interpretation === "Answer based on your uploaded documents.";

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {data && !isDocumentAnswer && (
        <>
          <p className="font-medium">{data.financial_summary}</p>
          <Badge variant="outline" className="capitalize">
            {data.intent.replace(/_/g, " ")}
          </Badge>
        </>
      )}
      {isDocumentAnswer && (
        <Badge variant="outline" className="text-xs">
          Document Q&amp;A
        </Badge>
      )}
      <p className="whitespace-pre-wrap font-mono text-xs">{message.content}</p>
      {message.isStreaming && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Analyzing…
        </span>
      )}
    </div>
  );
}

export default function ScenarioChatPage() {
  const { provider } = useAiProvider();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: createId(),
      role: "assistant",
      content:
        "I’m your financial intelligence advisor. Ask about affordability, what-if scenarios, or why certain months look tight — I’ll run deterministic forecasts and explain the results.",
      createdAt: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [latestResponse, setLatestResponse] =
    useState<SerializedScenarioChatResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMessage: ChatMessage = {
        id: createId(),
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      const assistantId = createId();
      const assistantPlaceholder: AssistantChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
      setInput("");
      setIsLoading(true);
      scrollToBottom();

      try {
        const finalData = await streamScenarioResponse(
          {
            message: trimmed,
            ...DEMO_FINANCIAL_CONTEXT,
            months: 12,
            use_llm: true,
            ai_provider: provider,
          },
          {
            onStructured: (data) => {
              setLatestResponse(data);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId && m.role === "assistant"
                    ? { ...m, response: data }
                    : m,
                ),
              );
            },
            onTextDelta: (_delta, fullText) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId && m.role === "assistant"
                    ? { ...m, content: fullText }
                    : m,
                ),
              );
              scrollToBottom();
            },
            onDone: (data) => {
              setLatestResponse(data);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId && m.role === "assistant"
                    ? {
                        ...m,
                        content:
                          m.content ||
                          `${data.financial_summary}\n\n${data.explanation}`,
                        response: data,
                        isStreaming: false,
                      }
                    : m,
                ),
              );
            },
          },
          controller.signal,
        );

        setLatestResponse(finalData);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        const errText =
          error instanceof Error ? error.message : "Something went wrong";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId && m.role === "assistant"
              ? {
                  ...m,
                  content: `Unable to complete the analysis: ${errText}`,
                  isStreaming: false,
                }
              : m,
          ),
        );
      } finally {
        setIsLoading(false);
        scrollToBottom();
      }
    },
    [isLoading, scrollToBottom, provider],
  );

  const timeline = latestResponse?.structured_data.timeline ?? [];
  const risk = latestResponse?.structured_data.risk;
  const insights =
    latestResponse?.structured_data.advice?.key_insights ??
    risk?.insights ??
    [];
  const recommendations =
    latestResponse?.structured_data.advice?.recommendations ??
    (latestResponse?.recommendation
      ? [latestResponse.recommendation]
      : []);

  return (
    <div className="flex h-[calc(100vh-0px)] min-h-0 flex-col lg:flex-row">
      {/* LEFT — Chat */}
      <section className="flex min-h-0 flex-1 flex-col border-b border-border lg:border-r lg:border-b-0">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Link
            href="/"
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border border-border"
          >
            <ArrowLeft className="size-4" />
            <span>Home</span>
          </Link>
          <Sparkles className="size-5 text-primary" />
          <div className="flex-1">
            <h1 className="text-lg font-semibold tracking-tight">
              Financial advisor
            </h1>
          </div>
          <AiProviderSwitch compact />
          <Link
            href="/documents"
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border border-border"
          >
            <FileText className="size-4" />
            <span>Documents</span>
          </Link>
        </header>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[90%] rounded-2xl px-4 py-3",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  {message.role === "user" ? (
                    <p className="text-sm whitespace-pre-wrap">
                      {message.content}
                    </p>
                  ) : (
                    <AssistantMessageBody message={message} />
                  )}
                </div>
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        <div className="border-t border-border p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <Button
                key={prompt}
                type="button"
                variant="outline"
                size="sm"
                className="h-auto whitespace-normal text-left text-xs"
                disabled={isLoading}
                onClick={() => sendMessage(prompt)}
              >
                {prompt}
              </Button>
            ))}
          </div>
          {voiceError ? (
            <p className="mb-2 text-xs text-destructive" role="alert">
              {voiceError}
            </p>
          ) : null}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
          >
            <GoogleVoiceAskButton
              disabled={isLoading}
              showModeLabel
              onTranscript={(text) => {
                setInput(text);
                setVoiceError(null);
              }}
              onError={setVoiceError}
            />
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your documents, affordability, or what-if scenarios…"
              className="min-h-[52px] resize-none"
              rows={2}
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              className="shrink-0 self-end"
              disabled={isLoading || !input.trim()}
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <SendHorizonal className="size-4" />
              )}
            </Button>
          </form>
        </div>
      </section>

      {/* RIGHT — Intelligence */}
      <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto bg-muted/30 p-4 lg:w-[420px]">
        <div className="flex gap-2">
          <Link
            href="/"
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border border-border"
          >
            <ArrowLeft className="size-4" />
            <span>Home</span>
          </Link>
          <Link
            href="/documents"
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border border-border"
          >
            <FileText className="size-4" />
            <span>Documents</span>
          </Link>
          <Link
            href="/ledger"
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border border-border"
          >
            <span>Ledger</span>
          </Link>
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">
              Cash flow forecast
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TimelineChart
              timeline={timeline}
              stressMonths={risk?.stress_months}
            />
          </CardContent>
        </Card>

        {latestResponse && (
          <RiskSummaryCard
            riskLevel={latestResponse.risk_level}
            risk={risk}
          />
        )}

        {latestResponse && (
          <InsightsPanel
            insights={insights}
            recommendations={recommendations}
          />
        )}

        {!latestResponse && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Send a message to see your live forecast and risk analysis.
            </CardContent>
          </Card>
        )}

        {latestResponse?.interpretation && (
          <p className="text-xs text-muted-foreground">
            {latestResponse.interpretation}
          </p>
        )}
      </aside>
    </div>
  );
}
