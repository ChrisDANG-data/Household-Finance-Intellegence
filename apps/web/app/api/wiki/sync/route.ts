import { jsonSuccess } from "@/utils/api-response";
import { withApiHandler } from "@/lib/api/route-handler";
import { syncObsidianVault } from "@/services/wiki/obsidian-vault.service";

export const runtime = "nodejs";

/** @deprecated Use /api/obsidian-vault/sync */
export async function POST() {
  return withApiHandler(async () => {
    const result = await syncObsidianVault();
    return jsonSuccess(result);
  });
}
