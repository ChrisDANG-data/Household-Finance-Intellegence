"use client";

import { cn } from "@/lib/utils";
import type { AiProvider } from "@/lib/ai-provider";
import { useAiProvider } from "@/components/ai/AiProviderContext";

interface AiProviderSwitchProps {
  className?: string;
  compact?: boolean;
}

export function AiProviderSwitch({ className, compact }: AiProviderSwitchProps) {
  const {
    provider,
    setProvider,
    loaded,
    claudeAvailable,
    geminiAvailable,
  } = useAiProvider();

  if (!loaded) {
    return (
      <div
        className={cn(
          "h-8 w-36 animate-pulse rounded-lg bg-muted/60",
          className,
        )}
        aria-hidden
      />
    );
  }

  if (!claudeAvailable && !geminiAvailable) {
    return (
      <span
        className={cn(
          "text-xs text-muted-foreground",
          className,
        )}
        title="Set ANTHROPIC_API_KEY or GEMINI_API_KEY in apps/web/.env"
      >
        No AI keys
      </span>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg border border-border/80 bg-muted/40 p-0.5",
        className,
      )}
      role="group"
      aria-label="AI model provider"
    >
      <ProviderButton
        label={compact ? "Claude" : "Claude"}
        active={provider === "claude"}
        disabled={!claudeAvailable}
        onClick={() => setProvider("claude")}
      />
      <ProviderButton
        label={compact ? "Gemini" : "Gemini"}
        active={provider === "gemini"}
        disabled={!geminiAvailable}
        onClick={() => setProvider("gemini")}
      />
    </div>
  );
}

function ProviderButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
        disabled && "cursor-not-allowed opacity-40",
      )}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}
