import { EngineModuleLayout } from "@/components/EngineModuleLayout";
import { PlaidBalanceHistoryPanel } from "@/components/integrations/PlaidBalanceHistoryPanel";

export const dynamic = "force-dynamic";

export default function BalancesPage() {
  return (
    <EngineModuleLayout
      wide
      title="Account balances"
      subtitle="Plaid balance history over time — separate from the 6-month forecast. Sync manually anytime; scheduled job runs once per UTC month."
    >
      <PlaidBalanceHistoryPanel />
    </EngineModuleLayout>
  );
}
