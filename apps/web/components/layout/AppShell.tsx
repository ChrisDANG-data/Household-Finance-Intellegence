"use client";

import { usePathname } from "next/navigation";

import { AiProviderProvider } from "@/components/ai/AiProviderContext";
import { FloatingNav } from "@/components/layout/FloatingNav";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onHero = pathname === "/";

  return (
    <AiProviderProvider>
      <div className="fi-app-bg relative flex min-h-full flex-col">
        <header
          className={cn(
            "px-4 pt-4 sm:px-6 sm:pt-5",
            onHero && "fixed inset-x-0 top-0 z-50",
          )}
        >
          <FloatingNav />
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </AiProviderProvider>
  );
}
