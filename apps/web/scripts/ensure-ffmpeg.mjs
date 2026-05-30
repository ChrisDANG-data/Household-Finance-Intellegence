/**
 * ffmpeg-static skips its binary when npm install runs with --ignore-scripts.
 * Ensures ffmpeg.exe (or ffmpeg) exists before local Whisper STT.
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

function findFfmpegPackageDir() {
  const roots = [
    process.cwd(),
    join(process.cwd(), ".."),
    join(process.cwd(), "..", ".."),
  ];
  for (const root of roots) {
    const pkgJson = join(root, "package.json");
    if (!existsSync(pkgJson)) continue;
    try {
      const require = createRequire(pkgJson);
      return dirname(require.resolve("ffmpeg-static/package.json"));
    } catch {
      // next root
    }
  }
  return null;
}

const pkgDir = findFfmpegPackageDir();
if (!pkgDir) {
  console.warn("[ensure-ffmpeg] ffmpeg-static package not found — skip");
  process.exit(0);
}

const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
const binaryPath = join(pkgDir, binaryName);

if (existsSync(binaryPath)) {
  process.exit(0);
}

console.log("[ensure-ffmpeg] Downloading ffmpeg binary (one-time)…");
const installScript = join(pkgDir, "install.js");
const result = spawnSync(process.execPath, [installScript], {
  stdio: "inherit",
  cwd: pkgDir,
});

if (result.status !== 0 || !existsSync(binaryPath)) {
  console.error(
    "[ensure-ffmpeg] Failed to download ffmpeg. Run: node node_modules/ffmpeg-static/install.js",
  );
  process.exit(result.status ?? 1);
}

console.log("[ensure-ffmpeg] ffmpeg ready at", binaryPath);
