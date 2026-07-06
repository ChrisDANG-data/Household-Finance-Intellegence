import { withAuthenticatedHandler } from "@/lib/api/authenticated-handler";
import { jsonSuccess } from "@/utils/api-response";
import { plaidApiService } from "@/services/integrations/plaid/plaid-api.service";
import { plaidItemService } from "@/services/integrations/plaid/plaid-item.service";

/** GET — whether Plaid is configured and the signed-in user has linked an item */
export async function GET() {
  return withAuthenticatedHandler(async (userId) => {
    const status = await plaidItemService.getConnectionStatus(userId);
    return jsonSuccess({
      ...status,
      plaid_configured: plaidApiService.isConfigured(),
    });
  });
}
