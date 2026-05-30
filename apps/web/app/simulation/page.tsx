import { EngineModuleLayout } from "@/components/EngineModuleLayout";
import { ForecastSimulator } from "@/components/simulation/ForecastSimulator";

export default function SimulationEnginePage() {
  return (
    <EngineModuleLayout
      wide
      title="Forecast Simulation"
      subtitle="Deterministic cash-flow projection, what-if scenarios, and AI Q&A over your financial state."
    >
      <ForecastSimulator />
    </EngineModuleLayout>
  );
}
