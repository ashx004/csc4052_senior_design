// A single slow/stuck document should never be allowed to hang an indexing
// job indefinitely — and when we give up, the underlying work needs to
// actually stop, not just get abandoned while it keeps running in the
// background. An earlier version of this only raced a timer against the
// promise without cancelling anything: every "timed out, giving up" retry
// left its chunk-processing loop running forever, silently hammering the
// secondary Ollama box with retries of its own — confirmed live 2026-07-21,
// several stacked orphaned loops kept the GPU busy for ~10 minutes with no
// visible cause until the whole dev server process was killed. Real
// cancellation via AbortController is the only way this stays fixed.
export function createTimeoutSignal(ms: number, label: string): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`${label} timed out after ${(ms / 1000).toFixed(0)}s`)), ms);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}
