import type { NextConfig } from "next";
import path from "node:path";

/** npm workspace root (Final_Project_AI) — hoisted deps like picocolors live here */
const monorepoRoot = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_AUTH_ENABLED:
      process.env.AUTH_ENABLED?.trim().toLowerCase() === "true"
        ? "true"
        : process.env.AUTH_ENABLED?.trim().toLowerCase() === "false"
          ? "false"
          : process.env.VERCEL === "1"
            ? "true"
            : "false",
  },
  serverExternalPackages: [
    "pdf-parse",
    "tesseract.js",
    "@xenova/transformers",
    "onnxruntime-node",
    "mupdf",
    "ffmpeg-static",
  ],
  turbopack: {
    root: monorepoRoot,
  },
  async rewrites() {
    return [
      {
        source: "/api/wiki/sync",
        destination: "/api/documents/obsidian-sync",
      },
      {
        source: "/api/wiki/export",
        destination: "/api/documents/obsidian-export",
      },
      {
        source: "/api/obsidian-vault/sync",
        destination: "/api/documents/obsidian-sync",
      },
      {
        source: "/api/obsidian-vault/export",
        destination: "/api/documents/obsidian-export",
      },
    ];
  },
};

export default nextConfig;
