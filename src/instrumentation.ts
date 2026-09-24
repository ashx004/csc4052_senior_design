// Runs once, guaranteed, before this server handles its first request -
// see https://nextjs.org/docs/app/guides/instrumentation. Global outbound
// fetch config belongs here rather than as a side effect of importing some
// specific route's module: setGlobalDispatcher used to live at the top of
// advisingOllama.ts, which worked only because every caller that made an
// Ollama request also imported that file first. Once /api/advising-jobs/
// worker started making its OWN outbound call (to /api/advising/extract)
// without importing advisingOllama.ts, a fresh server process could dispatch
// that call before advisingOllama.ts had ever loaded - silently running on
// undici's stock 5-minute default instead of the intended timeout, and
// failing with a HeadersTimeoutError well before advising's real work
// finished (confirmed live 2026-09-22: died at ~308s, matching the 5-minute
// default, immediately after a fresh restart hit the worker route first).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { Agent, setGlobalDispatcher } = await import("undici");

    // undici's default headersTimeout (5 min) can be too short both for a
    // slow/cold-loading Ollama call over the Cloudflare-tunneled path, and
    // for /api/advising-jobs/worker's own server-to-server call, which waits
    // on all 4 sequential advising extraction steps finishing inside one
    // outgoing request. 30 minutes matches that worker's own job lease (see
    // JOB_LEASE_MS in advising-jobs/worker/route.ts).
    setGlobalDispatcher(new Agent({ headersTimeout: 1_800_000 }));
  }
}
