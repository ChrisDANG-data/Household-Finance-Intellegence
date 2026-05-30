import { EngineModuleLayout } from "@/components/EngineModuleLayout";
import { FinancialEventForm } from "@/components/ledger/FinancialEventForm";
import { ObligationDashboard } from "@/components/ledger/ObligationDashboard";
import { DbSetupNotice } from "@/components/ui/DbSetupNotice";
import { currentUtcMonth } from "@/services/financial-state/dates";
import { obligationService } from "@/services/financial-state/obligation.service";

export const dynamic = "force-dynamic";

export default async function LedgerEnginePage() {
  const month = currentUtcMonth();
  let dbError: string | null = null;
  let obligations: Awaited<ReturnType<typeof obligationService.list>> = [];
  let summary: Awaited<ReturnType<typeof obligationService.getMonthlySummary>> =
    {
      month,
      total_monthly_obligations: 0,
      obligation_count: 0,
      active_obligation_ids: [],
    };

  try {
    [obligations, summary] = await Promise.all([
      obligationService.list(),
      obligationService.getMonthlySummary(month),
    ]);
  } catch (error) {
    dbError =
      error instanceof Error
        ? error.message
        : "Could not connect to the database.";
  }

  return (
    <EngineModuleLayout
      wide
      title="Financial Ledger"
      subtitle="Manage income and expenses. Add financial events manually or review obligations from uploaded documents."
    >
      {dbError ? (
        <DbSetupNotice message={dbError} />
      ) : (
        <div className="space-y-10">
          <div>
            <h2 className="mb-4 text-lg font-semibold tracking-tight">
              Add Income / Expense
            </h2>
            <FinancialEventForm />
          </div>
          <div className="border-t border-border pt-8">
            <ObligationDashboard
              initialObligations={obligations}
              initialSummary={summary}
              month={month}
            />
          </div>
        </div>
      )}
    </EngineModuleLayout>
  );
}
