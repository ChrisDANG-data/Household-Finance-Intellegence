"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Sparkles } from "lucide-react";

import { AiProviderSwitch } from "@/components/ai/AiProviderSwitch";
import { AuthNavActions } from "@/components/auth/AuthNavActions";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Home", exact: true },
  { href: "/documents", label: "Documents" },
  { href: "/ledger", label: "Ledger" },
  { href: "/balances", label: "Balances" },
  { href: "/simulation", label: "Forecast" },
] as const;

export function FloatingNav() {
  const pathname = usePathname();
  const onHero = pathname === "/";

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-2.5 sm:px-5",
        onHero ? "fi-nav-pill-hero" : "fi-nav-pill",
      )}
    >
      <Link href="/" className="fi-nav-brand flex shrink-0 items-center gap-2 pl-1">
        <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-900/20">
          <LayoutDashboard className="size-3.5" />
        </span>
        <span
          className={cn(
            "text-sm font-bold tracking-tight",
            onHero ? "text-white" : "text-foreground",
          )}
        >
          FinIntel
        </span>
      </Link>

      <nav className="hidden items-center gap-1 md:flex">
        {NAV_LINKS.map(({ href, label, ...link }) => {
          const active =
            "exact" in link && link.exact
              ? pathname === href
              : href === "/simulation"
                ? pathname.startsWith("/simulation")
                : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "fi-nav-link rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                onHero
                  ? active
                    ? "fi-nav-link-active bg-white/20 text-white"
                    : "text-white/85 hover:bg-white/12 hover:text-white"
                  : active
                    ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                    : "text-muted-foreground hover:bg-emerald-500/10 hover:text-foreground",
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        <AuthNavActions onHero={onHero} />
        <AiProviderSwitch compact className="hidden sm:inline-flex" />
        <Link
          href="/simulation"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold shadow-md transition hover:brightness-110",
            onHero
              ? "bg-white text-emerald-700 shadow-black/15"
              : "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-500/30",
          )}
        >
          <Sparkles className="size-3.5" />
          <span>Ask AI</span>
        </Link>
      </div>
    </div>
  );
}
