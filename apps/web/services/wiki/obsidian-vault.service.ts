import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";

import { env } from "@/lib/env";
import {
  compileWikiVault,
  type WikiCompileResult,
  type WikiFile,
} from "@/services/wiki/compile-wiki.service";
import { AppError } from "@/utils/errors";

export interface ObsidianSyncResult {
  pageCount: number;
  documentCount: number;
  categoryCount: number;
  eventCount: number;
  vaultSynced: boolean;
  vaultPath: string | null;
  message: string;
}

async function writeVaultFiles(
  vaultPath: string,
  files: WikiFile[],
): Promise<void> {
  const resolved = path.resolve(vaultPath);
  await mkdir(resolved, { recursive: true });

  for (const file of files) {
    const fullPath = path.join(resolved, file.path);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, file.content, "utf8");
  }
}

export async function buildVaultZipBuffer(files: WikiFile[]): Promise<Buffer> {
  const archiver = (await import("archiver")).default;

  return new Promise((resolve, reject) => {
    const passthrough = new PassThrough();
    const chunks: Buffer[] = [];

    passthrough.on("data", (chunk: Buffer) => chunks.push(chunk));
    passthrough.on("end", () => resolve(Buffer.concat(chunks)));
    passthrough.on("error", reject);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", reject);
    archive.pipe(passthrough);

    for (const file of files) {
      archive.append(file.content, { name: file.path.replace(/\\/g, "/") });
    }

    void archive.finalize();
  });
}

export async function syncObsidianVault(): Promise<ObsidianSyncResult> {
  const compiled = await compileWikiVault();
  const vaultPath = env.obsidian.vaultPath();

  if (!vaultPath) {
    return {
      pageCount: compiled.pageCount,
      documentCount: compiled.documentCount,
      categoryCount: compiled.categoryCount,
      eventCount: compiled.eventCount,
      vaultSynced: false,
      vaultPath: null,
      message:
        "Wiki compiled. Set OBSIDIAN_VAULT_PATH in .env to sync locally, or download the ZIP export.",
    };
  }

  try {
    await writeVaultFiles(vaultPath, compiled.files);
    return {
      pageCount: compiled.pageCount,
      documentCount: compiled.documentCount,
      categoryCount: compiled.categoryCount,
      eventCount: compiled.eventCount,
      vaultSynced: true,
      vaultPath: path.resolve(vaultPath),
      message: `Wrote ${compiled.pageCount} note(s) to Obsidian vault.`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Vault write failed";
    throw new AppError(`Obsidian vault sync failed: ${msg}`, {
      code: "VAULT_SYNC_FAILED",
      statusCode: 500,
    });
  }
}

export async function exportObsidianVaultZip(): Promise<{
  buffer: Buffer;
  compiled: WikiCompileResult;
}> {
  const compiled = await compileWikiVault();
  const buffer = await buildVaultZipBuffer(compiled.files);
  return { buffer, compiled };
}
