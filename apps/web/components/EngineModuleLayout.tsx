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
        "relative mx-auto px-4 pb-16 pt-8 sm:px-8 sm:pt-10",
        wide ? "max-w-6xl" : "max-w-5xl",
      )}
    >
      <div className="pointer-events-none absolute right-[10%] top-24 size-56 rounded-full bg-emerald-400/20 blur-[80px]" />

      <div className="relative mb-10">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-3 text-base text-foreground/65 sm:text-lg sm:whitespace-nowrap">
          {subtitle}
        </p>
      </div>

      <div className="glass-card relative overflow-hidden rounded-3xl border-emerald-500/15 p-6 shadow-xl sm:p-8">
        {children}
      </div>
    </div>
  );
}
