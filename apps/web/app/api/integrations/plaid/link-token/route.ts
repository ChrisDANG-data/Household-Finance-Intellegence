import { plaidApiService } from "@/services/integrations/plaid/plaid-api.service";
import type { PlaidLinkTokenRequest } from "@/services/integrations/plaid/plaid-api.service";
import { jsonError, jsonSuccess } from "@/utils/api-response";
import { toAppError } from "@/utils/errors";

/** POST — create a Plaid Link token (sandbox or production via env) */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as PlaidLinkTokenRequest;
    const data = await plaidApiService.createLinkToken(body);
    return jsonSuccess(data);
  } catch (error) {
    return jsonError(toAppError(error));
  }
}
