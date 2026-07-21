// Ollama silently falls back to CPU inference when a box's GPU is
// unavailable (driver fault, NVML lockup, etc.) — same request, same
// response shape, just 5-10x slower, with nothing in the API response
// itself flagging it. Left unchecked, that surfaces hours later as
// confusing downstream timeouts (this happened for real on 2026-07-20/21:
// a wedged NVIDIA driver on the secondary box went unnoticed until a batch
// job started hitting Cloudflare tunnel timeouts).
//
// This does a cheap, no-extra-request check using timing fields Ollama
// already returns (eval_count / eval_duration), and logs a loud, greppable
// warning the moment a box drops below GPU-plausible speed — so it shows up
// in server logs immediately instead of being discovered downstream.
const MIN_PLAUSIBLE_TOKENS_PER_SEC = 15;
const MIN_TOKENS_TO_JUDGE = 20; // shorter generations have too much fixed-overhead noise to trust

export function warnIfSlowGeneration(
  baseUrl: string,
  model: string,
  evalCount?: number,
  evalDurationNs?: number
): void {
  if (!evalCount || !evalDurationNs || evalCount < MIN_TOKENS_TO_JUDGE) return;

  const tokensPerSec = evalCount / (evalDurationNs / 1e9);
  if (tokensPerSec >= MIN_PLAUSIBLE_TOKENS_PER_SEC) return;

  console.error(
    `⚠️  OLLAMA GPU DEGRADATION SUSPECTED: ${model} on ${baseUrl} generated at ` +
      `${tokensPerSec.toFixed(1)} tok/s (below the ${MIN_PLAUSIBLE_TOKENS_PER_SEC} tok/s floor) — ` +
      `this speed is consistent with CPU fallback, not GPU inference. Check ` +
      `\`nvidia-smi\` on that box; a wedged NVIDIA driver has caused this before ` +
      `and needed a reboot to clear.`
  );
}
