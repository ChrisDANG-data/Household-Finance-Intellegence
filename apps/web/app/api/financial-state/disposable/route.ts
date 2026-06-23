import { jsonSuccess } from "@/utils/api-response";
import { withApiHandler } from "@/lib/api/route-handler";
import {
  disposableAssetsService,
} from "@/services/financial-state/disposable-assets.service";
import { DEFAULT_USER_ID } from "@/services/financial-state/financial-state.persistence";

/** GET — household disposable assets (live Plaid when linked) */
export async function GET(request: Request) {
  return withApiHandler(async () => {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id") ?? DEFAULT_USER_ID;
    const sync = searchParams.get("sync") === "true";

    const summary = sync
      ? await disposableAssetsService.syncAndGetSummary(userId)
      : await disposableAssetsService.getSummary(userId);

    return jsonSuccess({ user_id: userId, summary });
  });
}

/** POST — sync Plaid balances then return disposable assets summary */
export async function POST(request: Request) {
  return withApiHandler(async () => {
    const body = (await request.json().catch(() => ({}))) as { user_id?: string };
    const userId = body.user_id ?? DEFAULT_USER_ID;
    const summary = await disposableAssetsService.syncAndGetSummary(userId);
    return jsonSuccess({ user_id: userId, summary });
  });
}
