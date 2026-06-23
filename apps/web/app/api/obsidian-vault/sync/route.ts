import { jsonSuccess } from "@/utils/api-response";
import { withApiHandler } from "@/lib/api/route-handler";
import { syncObsidianVault } from "@/services/wiki/obsidian-vault.service";

export const runtime = "nodejs";

/** POST — Rebuild wiki notes and write to OBSIDIAN_VAULT_PATH when configured */
export async function POST() {
  return withApiHandler(async () => {
    const result = await syncObsidianVault();
    return jsonSuccess(result);
  });
}
