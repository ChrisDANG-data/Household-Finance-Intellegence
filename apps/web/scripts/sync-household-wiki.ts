/**
 * Compile FinIntel documents/events into Obsidian notes under Household/.
 * Reads apps/web/.env (DATABASE_URL, OBSIDIAN_VAULT_PATH).
 *
 * Usage (from repo root): npm run sync:household-wiki
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(webRoot, ".env") });

import { syncObsidianVault } from "../services/wiki/obsidian-vault.service";

async function main() {
  const result = await syncObsidianVault();
  console.log(JSON.stringify(result, null, 2));
  if (!result.vaultSynced) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
