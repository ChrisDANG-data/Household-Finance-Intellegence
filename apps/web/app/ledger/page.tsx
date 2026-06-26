import { EngineModuleLayout } from "@/components/EngineModuleLayout";
import { FinancialEventForm } from "@/components/ledger/FinancialEventForm";
import { DbSetupNotice } from "@/components/ui/DbSetupNotice";
import { financialStatePersistence } from "@/services/financial-state/financial-state.persistence";

export const dynamic = "force-dynamic";

export default async function LedgerEnginePage() {
  let dbError: string | null = null;

  try {
    await financialStatePersistence.ensureState();
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
      subtitle="Add income, expenses, and investments manually. Each row is a ledger event with its own start date and frequency — not tied to the current month."
    >
      {dbError ? (
        <DbSetupNotice message={dbError} />
      ) : (
        <FinancialEventForm />
      )}
    </EngineModuleLayout>
  );
}
