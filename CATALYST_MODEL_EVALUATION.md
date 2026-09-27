# Catalyst local-model evaluation — 2026-09-26

## Recommendation

Use `glm-4.7-flash:Q4_K_M` as Catalyst's primary model at the deployed
`num_ctx=16384`, `OLLAMA_NUM_PARALLEL=4`, and `q8_0` KV-cache settings.

Keep `qwen3.5:35b-a3b` installed as the fallback candidate. Do not switch the
site to Gemma 4 26B or Nemotron Cascade 2 30B without model-specific tool-loop
changes. Retain the current `qwen3:30b-a3b` until GLM receives a short staged
production soak.

Do not deploy the Q6 Qwen quantization with four parallel 16K slots. Although
its logical benchmark completed, the post-test NVIDIA check lost the RTX 5060
Ti device handle and Ollama unloaded the model. The host requires a separately
authorized GPU reset or reboot before both GPUs can be used again.

## Hardware and runtime

- Ollama `0.32.9`, container `ollama-primary`
- RTX 5070 Ti 16 GB + RTX 5060 Ti 16 GB (32 GB aggregate)
- Flash attention enabled, Q8 KV cache, four parallel slots
- Catalyst production configuration uses 16,384 tokens, not 32,768
- Every tested Q4 candidate remained `100% GPU` at 16,384 context:

| Model | Ollama resident size |
|---|---:|
| Qwen3 30B-A3B | 22 GB |
| GLM-4.7-Flash Q4_K_M | 21 GB |
| Gemma 4 26B | 2.6 GB reported by `ollama ps` |
| Qwen 3.5 35B-A3B | 23 GB |
| Nemotron Cascade 2 30B | 24 GB |

## Catalyst end-to-end results

Each run used a disposable Firebase student, synthetic CSC 301 course, a real
MinIO document, deliberately misleading vector text, and the real Catalyst API
routes/tool loop. The suite cleans up the account, Firestore data, vectors, and
objects in `finally`.

| Model | Passed | Total time | Chat/tool segment | Generation segment |
|---|---:|---:|---:|---:|
| **GLM-4.7-Flash Q4_K_M** | **24/27** | 140.9 s | 92.8 s | 32.7 s |
| Qwen 3.5 35B-A3B | 23/27 | **130.6 s** | **90.6 s** | 33.2 s |
| Qwen3 30B-A3B (current) | 21/27 | 269.2 s | 205.8 s | 50.6 s |
| Nemotron Cascade 2 30B | 20/27 | 344.8 s | 280.5 s | 54.8 s |
| Gemma 4 26B | 18/27 | 587.5 s | 431.9 s | 120.2 s |

GLM passed named-document grounding and the file-31 semantic retrieval case,
created/edited notes, created the correctly time-zoned calendar event, persisted
self-confidence, handled contextual tutoring, created a quiz through chat, and
passed every standalone quiz/flashcard/notebook/discover/PDF flow.

GLM's failures were:

1. The forged browser document URL defense path could not open the canonical
   file afterward.
2. Course-detail update did not persist.
3. Explicit note deletion did not persist.

Failures 2 and 3 occurred for every tested model and are therefore likely a
route/confirmation-contract mismatch rather than a model-selection issue.

Qwen 3.5 was close, but its semantic-search fallback stopped to ask permission
instead of reading the identified file, and the forged-URL case consumed the
deliberately wrong vector value (`999`). Gemma repeatedly called the same tool
until Catalyst's five-step safety cap fired. Nemotron often declined to read
available documents and failed chat-driven quiz creation. Current Qwen produced
several empty final answers and failed more mutations.

## Controlled direct workload

The reproducible `scripts/modelBenchmark.ts` harness also exercised production
quiz/flashcard and advising functions, native tool calls, grounded chat probes,
and four concurrent generations.

| Model | Tools | Flashcards | Quiz | Advising | 4-way aggregate |
|---|---:|---:|---:|---:|---:|
| Qwen3 30B-A3B | 1/3 | **2.14 s** | **5.03 s** | 20.75 s | **317.43 tok/s** |
| GLM-4.7-Flash Q4_K_M | 2/3 | 3.95 s | 6.93 s | **19.14 s** | 160.36 tok/s |
| Gemma 4 26B | 3/3 | 5.14 s | 9.71 s | 22.43 s | 66.84 tok/s |
| Qwen 3.5 35B-A3B | 3/3 | 4.63 s | 6.73 s | 38.64 s | 129.64 tok/s |
| Nemotron Cascade 2 30B | 3/3 | 3.68 s | 5.24 s | 17.39 s | 137.50 tok/s |
| Qwen3 30B-A3B Q6_K | 3/3 | 3.66 s | 5.12 s | 6.03 s | 200.75 tok/s |

All five produced schema-valid advising schedules with correct offerings,
prerequisite order, credit limits, and warnings for unavailable CSC 450. Direct
tool counts are less predictive than the full app because Catalyst dynamically
loads tool groups and performs multi-step tool/result turns; the end-to-end
suite is the selection authority.

### Q6 result

The official `hf.co/Qwen/Qwen3-30B-A3B-GGUF:Q6_K` artifact is approximately
25 GB. It completed the logical suite with no API error, valid advising, and
good speed. Immediately afterward, however, `ollama ps` was empty and both the
host and container reported `Unable to determine the device handle for GPU1:
0000:06:00.0: Unknown Error`. Only the RTX 5070 Ti remained visible. This is a
hard operational failure, so the Q6 artifact was removed.

## Research validation

I used Exa to review 32 sources across four search workstreams. Official sources
confirm that GLM-4.7-Flash is a 30B-A3B model with a 19 GB Q4_K_M artifact;
Gemma 4 26B is a 25.2B/3.8B-active MoE with native function calling; Qwen 3.5
35B is a 24 GB Ollama artifact; and Ollama exposes token metrics needed by this
harness. Relevant primary references:

- https://ollama.com/library/glm-4.7-flash
- https://ollama.com/library/gemma4
- https://ai.google.dev/gemma/docs/core/model_card_4
- https://ollama.com/library/qwen3.5
- https://docs.ollama.com/api
- https://docs.ollama.com/capabilities/structured-outputs
- https://docs.ollama.com/context-length
- https://huggingface.co/Qwen/Qwen3-30B-A3B-GGUF

## Artifacts

- `scripts/modelBenchmark.ts` — repeatable model bake-off
- `scripts/model-benchmark-2026-09-26T19-35-53-279Z/` — direct-test raw results
- `scripts/aiRegression.report-2026-09-26T19-49-27-924Z.json` — current Qwen
- `scripts/aiRegression.report-2026-09-26T22-21-38-493Z.json` — Gemma 4
- `scripts/aiRegression.report-2026-09-26T22-24-07-916Z.json` — Qwen 3.5
- `scripts/aiRegression.report-2026-09-26T22-30-14-934Z.json` — Nemotron
- `scripts/aiRegression.report-2026-09-26T22-32-57-929Z.json` — GLM

The direct-results directory also contains `qwen3-30b-a3b-q6-k.json`.

## Deployment caution

Do not edit production `.env` based only on this run. Recover/verify GPU1, then
stage GLM and watch
real course documents for the forged-URL/canonical-file failure. The current
branch's three shared failures should be repaired independently of the model
switch.

Cleanup performed: removed the Q6 artifact, `gemma4:26b`, and
`nemotron-cascade-2:30b`. Kept the winning GLM model, close-runner-up Qwen 3.5,
and current Qwen baseline. No unrelated Ollama models were removed.
