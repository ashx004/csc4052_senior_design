// Keeps public/pdf.worker.min.mjs in sync with the installed pdfjs-dist.
// The PDF renderer (ResourcePreview, PdfThumbnail) sets
// GlobalWorkerOptions.workerSrc to "/pdf.worker.min.mjs", and pdf.js throws a
// hard "API version does not match Worker version" error if the static worker
// file drifts from the npm-installed API version. Since package.json ranges
// (^6.1.200) can resolve to a newer build on any `npm install`, re-copy the
// matching worker on every install. Run via the "postinstall" npm hook.
import { copyFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const source = join(projectRoot, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const target = join(projectRoot, "public", "pdf.worker.min.mjs");

copyFileSync(source, target);
console.log("Synced public/pdf.worker.min.mjs with installed pdfjs-dist.");
