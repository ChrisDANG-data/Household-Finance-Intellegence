import { getAiProviderAvailability } from "@/services/ai/llm/llm.service";
import { jsonSuccess } from "@/utils/api-response";

/** GET — which LLM providers are configured (keys present in env) */
export async function GET() {
  return jsonSuccess(getAiProviderAvailability());
}
