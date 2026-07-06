import { withAuthenticatedHandler } from "@/lib/api/authenticated-handler";
import { jsonSuccess } from "@/utils/api-response";
import { plaidAccountsService } from "@/services/integrations/plaid/plaid-accounts.service";

/** GET — live Plaid accounts for the signed-in user */
export async function GET(request: Request) {
  return withAuthenticatedHandler(async (userId) => {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? undefined;
    const result = await plaidAccountsService.listLiveAccounts(userId, q);
    return jsonSuccess(result);
  });
}
