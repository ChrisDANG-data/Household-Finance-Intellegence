"use client";

import { useMemo } from "react";

import type { PlaidBalanceChartSeries } from "@/services/integrations/plaid/plaid-balance-history.service";
import { cn } from "@/lib/utils";

const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
];

interface PlaidBalanceLineChartProps {
  series: PlaidBalanceChartSeries[];
  className?: string;
}

function formatCad(value: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function PlaidBalanceLineChart({
  series,
  className,
}: PlaidBalanceLineChartProps) {
  const { labels, paths, yMin, yMax } = useMemo(() => {
    const dateSet = new Set<string>();
    for (const s of series) {
      for (const p of s.points) dateSet.add(p.snapshot_date);
    }
    const labels = [...dateSet].sort();
    if (labels.length === 0) {
      return { labels: [], paths: [], yMin: 0, yMax: 1 };
    }

    let yMin = Infinity;
    let yMax = -Infinity;

    const paths = series.map((s) => {
      const coords: { x: number; y: number; balance: number }[] = [];
      for (let i = 0; i < labels.length; i++) {
        const date = labels[i];
        const point = s.points.find((p) => p.snapshot_date === date);
        if (!point) continue;
        yMin = Math.min(yMin, point.balance);
        yMax = Math.max(yMax, point.balance);
        coords.push({ x: i, y: point.balance, balance: point.balance });
      }
      return { account_name: s.account_name, coords };
    });

    if (!Number.isFinite(yMin)) yMin = 0;
    if (!Number.isFinite(yMax)) yMax = 1;
    const pad = (yMax - yMin) * 0.08 || 100;
    return { labels, paths, yMin: yMin - pad, yMax: yMax + pad };
  }, [series]);

  if (labels.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No balance history yet. Connect Plaid and run a sync to start tracking.
      </p>
    );
  }

  const width = 720;
  const height = 280;
  const padL = 56;
  const padR = 16;
  const padT = 16;
  const padB = 40;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const yRange = yMax - yMin || 1;

  const xAt = (index: number) =>
    padL + (labels.length <= 1 ? innerW / 2 : (index / (labels.length - 1)) * innerW);
  const yAt = (value: number) =>
    padT + innerH - ((value - yMin) / yRange) * innerH;

  const yTicks = 4;
  const tickValues = Array.from({ length: yTicks + 1 }, (_, i) =>
    Number((yMin + (yRange * i) / yTicks).toFixed(0)),
  );

  return (
    <div className={cn("space-y-4", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full max-w-full"
        role="img"
        aria-label="Account balance trends"
      >
        {tickValues.map((tick) => {
          const y = yAt(tick);
          return (
            <g key={tick}>
              <line
                x1={padL}
                y1={y}
                x2={width - padR}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.08}
              />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[10px]"
              >
                {formatCad(tick)}
              </text>
            </g>
          );
        })}

        {paths.map((path, seriesIndex) => {
          if (path.coords.length < 2) {
            const c = path.coords[0];
            if (!c) return null;
            return (
              <circle
                key={path.account_name}
                cx={xAt(c.x)}
                cy={yAt(c.y)}
                r={5}
                fill={SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}
              />
            );
          }

          const d = path.coords
            .map((c, i) => {
              const cmd = i === 0 ? "M" : "L";
              return `${cmd}${xAt(c.x).toFixed(1)},${yAt(c.y).toFixed(1)}`;
            })
            .join(" ");

          return (
            <path
              key={path.account_name}
              d={d}
              fill="none"
              stroke={SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        {labels.map((label, i) => (
          <text
            key={label}
            x={xAt(i)}
            y={height - 10}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {label.slice(5)}
          </text>
        ))}
      </svg>

      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {series.map((s, i) => (
          <li key={s.plaid_account_id} className="flex items-center gap-2">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }}
            />
            <span className="text-foreground">{s.account_name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
