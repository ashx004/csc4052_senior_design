import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The app version shown on the settings page, read from package.json at build time.
const appVersion = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).version as string;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  // Keep deployment startup independent from the separately runnable lint.
  // Legacy lint violations are fixed incrementally, outside deployment.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // This app is self-hosted (Ollama/Qdrant/Google Cloud Storage all run on the team's own
  // GPU boxes, not Vercel) — standalone output traces the actual runtime
  // dependency graph and copies only that + a minimal server.js into
  // .next/standalone, instead of shipping the full node_modules tree. Real
  // win for restart/deploy time on our own hardware; irrelevant to `next dev`.
  output: "standalone",
  // pdfkit loads its built-in font metrics (data/*.afm) via a runtime
  // fs.readFileSync relative to its own package directory — webpack's
  // bundling (both `next dev` and the standalone build) moves its JS into
  // .next/server/vendor-chunks/ without carrying those non-JS asset files
  // along, so every generatePdfBuffer call failed with ENOENT looking for
  // vendor-chunks/data/Helvetica.afm (confirmed live 2026-08-14). Excluding
  // it from bundling makes it a plain require() from node_modules at
  // runtime instead, right next to its real .afm files.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
