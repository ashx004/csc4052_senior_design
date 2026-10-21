import { build } from "esbuild";
import { createRequire } from "node:module";
import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { nodeFileTrace } = require("next/dist/compiled/@vercel/nft");
const project = process.cwd();
const bundle = path.join(project, "dist/monitorWorker.cjs");
const output = path.join(project, "dist/monitor-runtime");

await build({
  entryPoints: ["scripts/monitorWorker.ts"],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  packages: "external",
});

const { fileList } = await nodeFileTrace([bundle], {
  base: project,
  conditions: ["node", "react-server"],
});
await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "workers"), { recursive: true });
await copyFile(bundle, path.join(output, "workers/monitorWorker.cjs"));
for (const file of fileList) {
  if (!file.startsWith("node_modules/")) continue;
  const destination = path.join(output, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(project, file), destination);
}
console.log("Monitoring worker and its runtime dependencies are packaged.");
