import { withAuthenticatedHandler } from "@/lib/api/authenticated-handler";
import { jsonSuccess } from "@/utils/api-response";
import { plaidApiService } from "@/services/integrations/plaid/plaid-api.service";
import type { PlaidLinkTokenRequest } from "@/services/integrations/plaid/plaid-api.service";

/** POST — create a Plaid Link token (sandbox or production via env) */
export async function POST(request: Request) {
  return withAuthenticatedHandler(async (userId) => {
    const body = (await request.json().catch(() => ({}))) as PlaidLinkTokenRequest;
    const data = await plaidApiService.createLinkToken({
      ...body,
      client_user_id: userId,
    });
    return jsonSuccess(data);
  });
}
