import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app is self-hosted (Ollama/Qdrant/MinIO all run on the team's own
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
