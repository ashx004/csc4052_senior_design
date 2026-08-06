import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app is self-hosted (Ollama/Qdrant/MinIO all run on the team's own
  // GPU boxes, not Vercel) — standalone output traces the actual runtime
  // dependency graph and copies only that + a minimal server.js into
  // .next/standalone, instead of shipping the full node_modules tree. Real
  // win for restart/deploy time on our own hardware; irrelevant to `next dev`.
  output: "standalone",
};

export default nextConfig;
