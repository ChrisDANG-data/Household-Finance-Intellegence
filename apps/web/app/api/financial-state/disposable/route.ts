import { withAuthenticatedHandler } from "@/lib/api/authenticated-handler";
import { jsonSuccess } from "@/utils/api-response";
import { disposableAssetsService } from "@/services/financial-state/disposable-assets.service";

/** GET — household disposable assets (live Plaid when linked) */
export async function GET(request: Request) {
  return withAuthenticatedHandler(async (userId) => {
    const { searchParams } = new URL(request.url);
    const sync = searchParams.get("sync") === "true";

    const summary = sync
      ? await disposableAssetsService.syncAndGetSummary(userId)
      : await disposableAssetsService.getSummary(userId);

    return jsonSuccess({ user_id: userId, summary });
  });
}

/** POST — sync Plaid balances then return disposable assets summary */
export async function POST() {
  return withAuthenticatedHandler(async (userId) => {
    const summary = await disposableAssetsService.syncAndGetSummary(userId);
    return jsonSuccess({ user_id: userId, summary });
  });
}
