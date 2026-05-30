import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

/**
 * Resolve ffmpeg-static binary path from the npm workspace (hoisted or local).
 * Uses createRequire so Next/Turbopack does not bundle ffmpeg-static at build time.
 */
export function resolveFfmpegPath(): string {
  const searchRoots = [
    process.cwd(),
    join(process.cwd(), ".."),
    join(process.cwd(), "..", ".."),
  ];

  for (const root of searchRoots) {
    const pkgJson = join(root, "package.json");
    if (!existsSync(pkgJson)) continue;
    try {
      const require = createRequire(pkgJson);
      const binaryPath = require("ffmpeg-static") as string | null | undefined;
      if (binaryPath && existsSync(binaryPath)) {
        return binaryPath;
      }
    } catch {
      // try next root
    }
  }

  throw new Error(
    "ffmpeg binary missing. From apps/web run: node scripts/ensure-ffmpeg.mjs",
  );
}
