import {
  BarChart3,
  Cloud,
  FileText,
  Landmark,
  Sparkles,
  Wallet,
} from "lucide-react";

import { HomeAuthGate } from "@/components/home/HomeAuthGate";
import { HomeFeatureCard } from "@/components/home/HomeFeatureCard";
import { HomeHeroWave } from "@/components/home/HomeHeroWave";

const FEATURES = [
  {
    name: "Documents",
    href: "/documents",
    description:
      "Upload contracts and receipts — obligations flow straight into your ledger.",
    icon: FileText,
  },
  {
    name: "Ledger",
    href: "/ledger",
    description:
      "Your canonical ledger — income, expenses, and investments in one place.",
    icon: Wallet,
  },
  {
    name: "Balances",
    href: "/balances",
    description:
      "Plaid-linked account balances and snapshot history over time.",
    icon: Landmark,
  },
  {
    name: "Forecast",
    href: "/simulation",
    description:
      "Six-month cash-flow charts, what-if scenarios, and natural-language Q&A.",
    icon: BarChart3,
    featured: true,
  },
] as const;

export default function HomePage() {
  return (
    <HomeAuthGate>
      <HomePageContent />
    </HomeAuthGate>
  );
}

function HomePageContent() {
  return (
    <div className="fi-home-page">
      <section className="fi-cloudme-hero relative overflow-hidden pb-28 pt-28 sm:pb-36 sm:pt-32">
        <div className="pointer-events-none absolute -left-16 top-20 size-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute right-0 top-10 size-72 rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-32 left-1/4 size-40 rounded-full bg-teal-200/15 blur-2xl fi-orb" />
        <Cloud className="pointer-events-none absolute right-[12%] top-[28%] size-24 text-white/10 sm:size-32" />
        <Cloud className="pointer-events-none absolute left-[8%] top-[38%] size-16 text-white/8 sm:size-20" />

        <div className="relative z-10 mx-auto max-w-6xl px-4 text-center sm:px-8">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 py-2 text-xs font-semibold uppercase tracking-widest text-white/95 backdrop-blur-sm">
            <Sparkles className="size-4" />
            Household Financial Intelligence
          </p>

          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
            Know your cash flow.
            <br />
            <span
              className="font-normal italic text-white/95"
              style={{ fontFamily: "var(--font-playfair), Georgia, serif" }}
            >
              Act on it.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/80 sm:text-lg">
            Deterministic forecasts from your ledger. Ask AI about affordability,
            balance trends, and what-if scenarios — numbers stay exact.
          </p>
        </div>

        <HomeHeroWave />
      </section>

      <section className="relative bg-[#f0fdf8] px-4 pb-20 pt-4 dark:bg-[#071a10] sm:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-4">
            {FEATURES.map((feature) => (
              <HomeFeatureCard key={feature.name} {...feature} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
