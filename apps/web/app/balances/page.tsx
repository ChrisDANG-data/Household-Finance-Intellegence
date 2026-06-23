import { EngineModuleLayout } from "@/components/EngineModuleLayout";
import { PlaidBalanceHistoryPanel } from "@/components/integrations/PlaidBalanceHistoryPanel";

export const dynamic = "force-dynamic";

export default function BalancesPage() {
  return (
    <EngineModuleLayout
      wide
      title="Account balances"
      subtitle="Disposable assets, Plaid balance history, and end-of-month sync — separate from the 6-month forecast."
    >
      <PlaidBalanceHistoryPanel />
    </EngineModuleLayout>
  );
}
