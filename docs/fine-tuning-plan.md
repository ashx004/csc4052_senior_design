# QLoRA Fine-Tuning Plan: Fixing the Contact-Info Fabrication Bug

## Why this, specifically

`.claude/NOTES_FOR_NEXT_SESSION.md` documents the single strongest case for fine-tuning found so far: asked "tell me about my classes" against real enrollment data with explicitly blank instructor contact fields, the model fabricated a specific fake email/phone/office (`akiremire@latech.edu, 225-225-2255, IESB 218` — built from the real instructor's last name + the real school's domain, not random noise) **identically across three completely different prompt architectures** (a ~3,700-token version, a ~1,300-token version, and the current 4-layer version with a dedicated post-tool anti-fabrication layer). Identical output every time means this isn't a wording problem — it's a known LLM failure mode (plausible slot-filling for structured fields overriding an explicit "leave blank" instruction) that prompting has already been shown not to fix. That makes it a genuinely good fine-tuning target: a narrow, well-characterized, repeatedly-reproduced behavior, not a vague "make it better."

A secondary, smaller candidate noted in the same session: asking to "summarize" an assignment document instead produced a full solution to the assignment. Worth a look once the primary target is validated, using the same pipeline — not tackled in this first pass, to keep the experiment focused.

## Why QLoRA is the right tool here (not full fine-tuning)

Full fine-tuning a 14B model needs the full model's weights + optimizer state in memory (~150GB+ for Adam), completely impractical on a single 16GB-class consumer GPU. QLoRA quantizes the frozen base model to 4-bit and trains only a small set of low-rank adapter weights on top — the actual trainable parameter count is a tiny fraction of 14B, so the memory footprint drops to something that fits comfortably on a 5070 Ti (16GB VRAM), especially using Unsloth (a training library specifically optimized for exactly this consumer-GPU QLoRA case — faster and more memory-efficient than vanilla `peft`+`transformers`). This is why "too hard" was the wrong read: full fine-tuning would have been, QLoRA isn't.

## Approach

### 1. Base model
`Qwen/Qwen3-14B` from Hugging Face — the same model family already deployed as `qwen3:14b` in Ollama, so behavior learned here transfers directly to what's actually running in production once converted back.

### 2. Training method: DPO, not plain SFT
This isn't a "teach it a new skill" problem — it's a "stop doing this specific wrong thing, do this specific right thing instead" problem, and we have the *exact* wrong output already documented. That's a preference-pair problem: Direct Preference Optimization (DPO) trains on `(prompt, chosen, rejected)` triples, explicitly pushing probability mass away from `rejected` (the fabricated answer) and toward `chosen` (the honest "not entered" answer), which is a more direct fix than SFT-only (which only ever shows correct examples and hopes the wrong pattern fades from disuse).

### 3. Dataset — synthetic, templated, generated now rather than waited on
There's no eval harness or failure-log corpus to mine (removed by prior request, confirmed in dev notes) — but the failure is deterministic and reproducible, so we don't need to wait for it to occur naturally. Generate ~150-300 `(prompt, chosen, rejected)` triples by templating across:
- Varying instructor last names, course codes/names, and which specific fields are blank (email only, phone only, all three, mixed blank/filled) — drawn from realistic name/course-code distributions, not the exact same reproduced example every time (that would just memorize one instructor's name pattern rather than learning the general "blank means blank" behavior).
- `chosen`: the honest answer, explicitly stating which fields aren't entered/uploaded, in the app's actual tone (matches `buildPostToolLayer`'s existing instruction: "if a field is blank in the result, say plainly it wasn't entered").
- `rejected`: a fabricated-but-plausible answer in the exact style the bug produces (a constructed email from the surname + school domain, a plausible-looking phone number, a plausible-sounding office string) — generate these by literally prompting the *current, unmodified* model with the same templated scenarios and keeping the runs where it actually fabricates (which per the notes should be close to 100% of the time) — this guarantees the rejected examples are the model's real failure distribution, not a guessed approximation of it.
- Include a smaller slice (~20%) of "field IS filled in, use it correctly" examples too, so the adapter learns "reflect what's actually there" rather than overcorrecting into always saying "not entered" regardless of input.

### 4. Hyperparameters (2026 consumer-QLoRA defaults)
- `r=16`, `target_modules="all-linear"`, DoRA enabled
- 4-bit base (`bnb_4bit_quant_type="nf4"`, double quantization)
- Learning rate `2e-4` (SFT warmup phase, if used) / lower (`5e-6`–`1e-5`) for the DPO phase, cosine schedule with warmup
- Batch size 1 with gradient accumulation (Unsloth + gradient checkpointing makes this workable on 16GB), a few epochs over the small dataset — this is a targeted correction, not a large-scale retrain, so overfitting risk from too many epochs matters more than undertraining
- Train on **primary** (RTX 5070 Ti) per the "heavy workloads go on primary" infra decision made this session

### 5. Evaluation (lightweight, manual — no harness exists)
Hold out ~20-30 of the templated scenarios (not used in training) plus a few hand-written novel scenarios (different phrasing of the same underlying question, different tool-result shapes) as a fixed test set. Run both the stock model and the fine-tuned adapter against the identical test set, and manually check each response for the specific documented failure (does it invent a contact detail for a blank field, yes/no). This is a binary, easy-to-judge check per example — exactly the kind of eval that doesn't need a full harness to be trustworthy, given how deterministic and specific the failure is.

### 6. Deployment path
1. Merge the trained LoRA adapter into the base weights (`peft`'s `merge_and_unload`).
2. Convert the merged model to GGUF via `llama.cpp`'s `convert_hf_to_gguf.py`, quantized to `Q4_K_M` — confirmed via `ollama show qwen3:14b` on primary that this is exactly what's currently deployed (14.8B params), so the fine-tuned version stays directly comparable in size/speed.
3. `ollama create catalyst-qwen3-14b-ft -f Modelfile` on primary, pointing at the converted GGUF.
4. A/B test: temporarily point `OLLAMA_MODEL` at the new tag in a **local dev** `.env` only (never the deployed server's `.env` without sign-off) and run the same held-out eval set against it live through the real chat pipeline, not just the raw model, before ever considering a production switch.

## What this session actually did vs. what's still a follow-up

**Done now**: this plan, and the training environment provisioned on primary (Python venv with `unsloth`, `transformers`, `peft`, `trl`, `bitsandbytes`, `datasets` installed and GPU-verified — see below).

**Deliberately not done in this same session**: writing and generating the actual ~150-300 example dataset (the "generate rejected examples by running the current model until it fabricates" step alone is a real, careful data-collection task, not something to rush through inline), and running the actual training job. Both are a distinct, focused follow-up once this plan is reviewed — training itself, per the Unsloth/QLoRA research, should only take on the order of hours once the dataset exists, so the dataset curation is the actual bottleneck, not compute.

## Is there actually enough compute? (verified, not assumed)

Directly checked rather than taken on faith: Unsloth's own published reference confirms Qwen3-14B QLoRA fits and trains on a 16GB Tesla T4 — the primary box's RTX 5070 Ti (16GB) is the same VRAM tier, so the model itself is not the constraint.

**The real constraint is concurrency, not capacity.** `nvidia-smi` on primary showed ~10GB in use when Ollama's `qwen3:14b` is actively loaded serving chat traffic (confirmed earlier this session), vs. ~10MB when idle (`OLLAMA_KEEP_ALIVE` unloads it after inactivity). QLoRA training needs close to the full 16GB budget itself. **Training and live student chat traffic cannot run on this GPU at the same time** without risking an OOM on whichever started second — this isn't a background task, it needs a scheduled exclusive window (e.g., stop/unload `ollama-primary` first, or run during confirmed-idle hours), not something kicked off casually while the app is in use.

