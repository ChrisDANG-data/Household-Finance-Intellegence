"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface InsightsPanelProps {
  insights: string[];
  recommendations: string[];
}

export function InsightsPanel({ insights, recommendations }: InsightsPanelProps) {
  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Insights</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 pb-4">
        <ScrollArea className="h-48 pr-3">
          <div className="space-y-4">
            {insights.length > 0 && (
              <section>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Key insights
                </h4>
                <ul className="space-y-2 text-sm">
                  {insights.map((item) => (
                    <li key={item} className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {recommendations.length > 0 && (
              <section>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Recommendations
                </h4>
                <ul className="list-disc space-y-2 pl-4 text-sm">
                  {recommendations.map((item) => (
                    <li key={item} className="leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {insights.length === 0 && recommendations.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Send a message to generate insights from your forecast.
              </p>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
