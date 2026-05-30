import { plaidAccountsService } from "@/services/integrations/plaid/plaid-accounts.service";
import { DEFAULT_USER_ID } from "@/services/financial-state/financial-state.persistence";
import { jsonError, jsonSuccess } from "@/utils/api-response";
import { toAppError } from "@/utils/errors";

/** GET — live Plaid balances per account (credit card, checking, etc.) */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id") ?? DEFAULT_USER_ID;
    const q = searchParams.get("q") ?? searchParams.get("account") ?? undefined;

    const result = await plaidAccountsService.listLiveAccounts(userId, q);
    return jsonSuccess(result);
  } catch (error) {
    return jsonError(toAppError(error));
  }
}
