import { withAuthenticatedHandler } from "@/lib/api/authenticated-handler";
import { jsonSuccess } from "@/utils/api-response";
import { AppError } from "@/utils/errors";
import { plaidApiService } from "@/services/integrations/plaid/plaid-api.service";
import { plaidDirectSyncService } from "@/services/integrations/plaid/plaid-direct-sync.service";
import { plaidItemService } from "@/services/integrations/plaid/plaid-item.service";

interface ExchangeBody {
  public_token?: string;
  /** When true, immediately call /accounts/balance/get and update current_cash */
  sync_balances?: boolean;
}

/** POST — exchange Link public_token, optionally sync balances */
export async function POST(request: Request) {
  return withAuthenticatedHandler(async (userId) => {
    const body = (await request.json()) as ExchangeBody;
    if (!body.public_token?.trim()) {
      throw new AppError("public_token is required", {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    const exchanged = await plaidApiService.exchangePublicToken(body.public_token);
    await plaidItemService.saveAccessToken({
      user_id: userId,
      item_id: exchanged.item_id,
      access_token: exchanged.access_token,
    });

    let balanceSync: Awaited<
      ReturnType<typeof plaidDirectSyncService.syncBalancesForUser>
    > | undefined;

    if (body.sync_balances !== false) {
      balanceSync = await plaidDirectSyncService.syncBalancesForUser(
        userId,
        undefined,
        { sync_source: "link", force: true },
      );
    }

    return jsonSuccess({
      item_id: exchanged.item_id,
      request_id: exchanged.request_id,
      balance_sync: balanceSync ?? null,
    });
  });
}
