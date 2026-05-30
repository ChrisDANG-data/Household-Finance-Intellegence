import { plaidApiService } from "@/services/integrations/plaid/plaid-api.service";
import { plaidItemService } from "@/services/integrations/plaid/plaid-item.service";
import { jsonSuccess } from "@/utils/api-response";

/** GET — whether Plaid is configured and a user has linked an item */
export async function GET() {
  const status = await plaidItemService.getConnectionStatus();
  return jsonSuccess({
    ...status,
    plaid_configured: plaidApiService.isConfigured(),
  });
}
