import { plaidApiService } from "@/services/integrations/plaid/plaid-api.service";
import { plaidDirectSyncService } from "@/services/integrations/plaid/plaid-direct-sync.service";
import { plaidItemService } from "@/services/integrations/plaid/plaid-item.service";
import { jsonError, jsonSuccess } from "@/utils/api-response";
import { toAppError } from "@/utils/errors";

interface ExchangeBody {
  public_token?: string;
  user_id?: string;
  /** When true, immediately call /accounts/balance/get and update current_cash */
  sync_balances?: boolean;
}

/** POST — exchange Link public_token, optionally sync balances */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExchangeBody;
    if (!body.public_token?.trim()) {
      return jsonError({
        code: "VALIDATION_ERROR",
        message: "public_token is required",
        statusCode: 400,
      });
    }

    const exchanged = await plaidApiService.exchangePublicToken(body.public_token);
    await plaidItemService.saveAccessToken({
      user_id: body.user_id,
      item_id: exchanged.item_id,
      access_token: exchanged.access_token,
    });

    let balanceSync: Awaited<
      ReturnType<typeof plaidDirectSyncService.syncBalancesForUser>
    > | undefined;

    if (body.sync_balances !== false) {
      balanceSync = await plaidDirectSyncService.syncBalancesForUser(
        body.user_id,
        undefined,
        { sync_source: "link", force: true },
      );
    }

    return jsonSuccess({
      item_id: exchanged.item_id,
      request_id: exchanged.request_id,
      balance_sync: balanceSync ?? null,
    });
  } catch (error) {
    return jsonError(toAppError(error));
  }
}
