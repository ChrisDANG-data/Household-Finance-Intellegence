import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface EngineModuleCardProps {
  name: string;
  href: string;
  description: string;
  apiPath: string;
  icon: LucideIcon;
  gradient: string;
  iconColor: string;
  featured?: boolean;
}

export function EngineModuleCard({
  name,
  href,
  description,
  apiPath,
  icon: Icon,
  gradient,
  iconColor,
  featured,
}: EngineModuleCardProps) {
  return (
    <Link
      href={href}
      aria-label={`Open ${name}`}
      className={cn(
        "group relative block h-full overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-6 shadow-sm backdrop-blur-sm transition-all duration-300",
        "hover:-translate-y-1 hover:border-emerald-500/40 hover:shadow-xl hover:shadow-emerald-500/10",
        featured && "ring-1 ring-emerald-500/30",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-60 transition-opacity group-hover:opacity-100",
          gradient,
        )}
      />
      <div className="relative flex h-full flex-col">
        <div className="mb-4 flex items-start justify-between">
          <span
            className={cn(
              "flex size-12 items-center justify-center rounded-2xl bg-background/80 shadow-inner",
              iconColor,
            )}
          >
            <Icon className="size-6" />
          </span>
          <ArrowUpRight className="size-5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-emerald-600" />
        </div>
        {featured && (
          <Badge className="mb-2 w-fit border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
            Start here
          </Badge>
        )}
        <h3 className="text-lg font-semibold tracking-tight">{name}</h3>
        <p className="mt-2 flex-1 text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
        <p className="mt-4 font-mono text-[10px] text-muted-foreground/80">
          {apiPath}
        </p>
      </div>
    </Link>
  );
}
