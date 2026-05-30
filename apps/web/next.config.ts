import type { NextConfig } from "next";
import path from "node:path";

/** npm workspace root (Final_Project_AI) — hoisted deps like picocolors live here */
const monorepoRoot = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
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
};

export default nextConfig;
