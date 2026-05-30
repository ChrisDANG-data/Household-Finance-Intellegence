import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EngineModuleLayoutProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  wide?: boolean;
}

export function EngineModuleLayout({
  title,
  subtitle,
  children,
  wide = false,
}: EngineModuleLayoutProps) {
  return (
    <div
      className={cn(
        "mx-auto px-4 py-10 sm:px-6 sm:py-12",
        wide ? "max-w-6xl" : "max-w-3xl",
      )}
    >
      <div className="mb-8">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-4 text-muted-foreground"
          render={<Link href="/" />}
          nativeButton={false}
        >
          <ArrowLeft className="size-4" />
          Home
        </Button>
        <p className="text-xs font-medium uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
          Engine module
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
