# Production image for the Catalyst site and its OCR worker.
#
# Built by GitHub Actions (.github/workflows/deploy-image.yml) and pushed to
# GHCR, so the server only ever pulls a finished image - it never runs
# `npm install` or `next build` itself. Building on the e2-medium VM pegged
# both vCPUs and exhausted its 4 GB of RAM.

# --- Stage 1: dependencies ---------------------------------------------------
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# package.json's postinstall hook runs scripts/copy-pdf-worker.mjs.
COPY scripts ./scripts
RUN npm ci

# --- Stage 2: build ----------------------------------------------------------
FROM deps AS builder
COPY . .
# NEXT_PUBLIC_* values are inlined into the browser bundle at build time, so
# they must exist here. CI writes them to .env.production from the
# NEXT_PUBLIC_ENV repository secret; server-only secrets are never baked in
# and are read at runtime from the .env mounted on the server.
ENV NEXT_TELEMETRY_DISABLED=1
RUN set -a && . ./docker/build-placeholders.env && set +a \
 && export FIREBASE_ADMIN_PRIVATE_KEY="$(node -e 'console.log(require("crypto").generateKeyPairSync("rsa",{modulusLength:2048}).privateKey.export({type:"pkcs8",format:"pem"}))')" \
 && npm run build \
 && rm -f .next/standalone/.env*
# The OCR worker only needs @next/env; bundle it to one file so the runtime
# image doesn't need tsx or the full node_modules tree.
RUN npx esbuild scripts/ocrWorker.ts --bundle --platform=node --format=cjs \
      --target=node22 --outfile=dist/ocrWorker.cjs

RUN node scripts/packageMonitorWorker.mjs

# --- Stage 3: runtime --------------------------------------------------------
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# /legal/[doc] reads these at render time.
COPY --from=builder --chown=node:node /app/docs/legal ./docs/legal
# Loaded by path at runtime, which standalone file tracing can't see:
# pdfExtract.ts points PDF.js at node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs,
# and pdfkit reads its data/*.afm font metrics relative to its own package dir.
COPY --from=builder --chown=node:node /app/node_modules/pdfjs-dist ./node_modules/pdfjs-dist
COPY --from=builder --chown=node:node /app/node_modules/pdfkit ./node_modules/pdfkit
COPY --from=builder --chown=node:node /app/dist/ocrWorker.cjs ./workers/ocrWorker.cjs

COPY --from=builder --chown=node:node /app/dist/monitor-runtime ./

USER node
EXPOSE 3000
# The OCR worker uses this same image with `command: node workers/ocrWorker.cjs`.
CMD ["node", "server.js"]
