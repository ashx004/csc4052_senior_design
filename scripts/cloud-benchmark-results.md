# Cloud model benchmark - 2026-10-18

Hosted candidates for moving Catalyst's AI off the self-hosted Ollama boxes.
Each model ran the real production generators (flashcards, quiz, advising,
OCR) plus the chat hallucination and tool-calling cases from
`scripts/modelBenchmark.ts`, routed through `scripts/cloudOllamaShim.ts`.
Per-run JSON is in the `cloud-benchmark-2026-10-18T*` folders beside this
file. Every call is logged in `cloud-benchmark-spend.jsonl`.

**Total spend for every run, including smoke tests and reruns: about $0.15.**

Costs are what the provider charged. The OpenRouter figures are its reported
`usage.cost`. Groq and Google are computed from their published rates, checked
2026-10-18. A "$/1k" figure is the cost of that test's calls multiplied by
1,000. A chat turn here is a single benchmark prompt with the full system
prompt. Real turns with history and documents will cost more.

| Model | Hallucination | Tools | Flashcards | Quiz | Advising | OCR recall / CER | $/1k chat turns | $/1k quizzes | $/1k flashcard sets | $/1k OCR pages |
|---|---|---|---|---|---|---|---|---|---|---|
| openrouter:qwen/qwen3.7-flash | 4/4 | 2/3 | 10 (9.15s) | 10 (30.59s) | valid (26.12s) | 95.5% / CER 1.1% | 0.09 | 0.39 | 0.13 | 0.30 |
| google:gemini-3.1-flash-lite | 4/4 | 3/3 | 10 (1.89s) | 10 (4.61s) | valid (101.51s) | 95.5% / CER 1.1% | 0.90 | 3.29 | 1.24 | 0.54 |
| google:gemini-3.5-flash-lite | 4/4 | 3/3 | 10 (2.38s) | 10 (7.23s) | valid (1.66s) | 95.5% / CER 1.1% | 1.13 | 6.45 | 1.92 | 0.74 |
| google:gemini-3.8-flash | 4/4 | 2/3 | 10 (6.76s) | 10 (15.16s) | valid (5.41s) | 95.5% / CER 1.1% | 3.79 | 8.71 | 3.64 | 7.63 |
| groq:openai/gpt-oss-120b | error | 3/3 | 10 (9.98s) | 10 (17.29s) | valid (20.98s) | error | — | 1.27 | 0.57 | — |
| groq:openai/gpt-oss-20b | error | 3/3 | 10 (10.97s) | 10 (14.74s) | valid (24s) | error | — | 0.44 | 0.24 | — |
| openrouter:deepseek/deepseek-v3.2 | 3/4 | 2/3 | 10 (11.58s) | 10 (32.63s) | valid (3.99s) | error | 0.71 | 1.23 | 0.62 | — |
| openrouter:google/gemma-4-26b-a4b-it | 4/4 | 3/3 | 10 (6.24s) | 10 (23.53s) | valid (2.29s) | 100.0% / CER 0.0% | 0.28 | 0.73 | 0.20 | 0.10 |
| openrouter:qwen/qwen3.6-35b-a3b | 4/4 | 2/3 | 10 (19.57s) | 10 (26.44s) | valid (53.09s) | 100.0% / CER 0.0% | 0.61 | 1.44 | 0.69 | 0.60 |
| openrouter:z-ai/glm-4.7-flash | 4/4 | 2/3 | 10 (20.37s) | 10 (24.13s) | valid (22s) | error | 0.44 | 0.71 | 0.30 | — |
| openrouter:z-ai/glm-5.3-flash | 4/4 | 2/3 | 10 (9.39s) | 10 (35.13s) | valid (2.41s) | 100.0% / CER 0.0% | 0.36 | 0.58 | 1.15 | 0.27 |
| openrouter:mistralai/mistral-small-2603 | — | — | — | — | — | 100.0% / CER 0.0% | — | — | — | 0.30 |
| openrouter:qwen/qwen3-vl-30b-a3b-instruct | — | — | — | — | — | 98.5% / CER 0.3% | — | — | — | 0.25 |
| openrouter:qwen/qwen3-vl-8b-instruct | — | — | — | — | — | 100.0% / CER 0.0% | — | — | — | 0.38 |

## Notes

- **Errors that come from the model, not the harness:**
  - **Groq gpt-oss hallucination test.** The model tried to call a web-search tool that wasn't offered, and Groq rejected the reply ("Tool choice is none, but model called a tool"). Production chat always sends tools, so this mostly reflects the test setup. It is still a sign that the model reaches for tools it doesn't have.
  - **OCR "error" on gpt-oss, deepseek-v3.2 and glm-4.7-flash.** These models accept text only.
- **OCR fixtures are synthetic printed text.** One is a clean scan and one a degraded phone photo, both from `fixtures/ocr/generate.py`. Every vision model got all 8 key facts on both images. The 95.5% word-recall scores trace to one or two formatting differences. Real handwriting has not been tested yet.
- **Gemini:**
  - **2.5 Flash-Lite** returns "no longer available to new users" for new keys, so 3.5 Flash-Lite replaced it.
  - **3.6 and 3.8 Flash** list launch prices that double on 2027-01-01, per ai.google.dev pricing.
- **Speed is end-to-end wall time,** including network and provider queueing. The Gemini 3.1 Flash-Lite advising time (101s) includes 503 "overloaded" retries.
- **The sample is small:** 3-4 cases per chat category. Treat a 2/3 against 3/3 difference as a signal, not a verdict.

## Reading

Gemma 4 26B on OpenRouter is the only model that passed every test, OCR
included. It is also among the cheapest at every feature, so one model could
cover chat, generation and OCR. GLM-5.3-Flash and Qwen3.7-Flash are close and
cheaper still on some features, but each missed one tool case. If OCR stays a
separate model, qwen3-vl-8b and mistral-small-2603 were also perfect. The
Gemini models are reliable and fast but cost 3-10x more per feature than the
open models.

## Round 2: real handwriting and repeat runs (2026-10-18)

### OCR on 5 real notebook photos

The photos are handwriting, highlighter, vector math and diagrams. They are kept
out of git; `fixtures/ocr/real/facts.json` lists the 81 facts each transcription
is checked for, as written. Page 1 says "March 2026" for AlphaGo (really
2016), so a model that silently "corrects" it fails that fact.

| Model | Facts found | Kept "2026" as written | $/1k pages |
|---|---|---|---|
| **GLM-5.3-Flash** | **100%** | yes | 0.82 |
| Qwen3.6-35B | 100% | yes | 2.51 |
| Gemini 3.1 Flash-Lite | 98.8% | no | 0.74 |
| Gemini 3.5 Flash-Lite | 98.8% | no | 1.04 |
| Qwen3.7-Flash | 98.8% | no | 0.56 |
| qwen3-vl-30b | 97.5% | no | 0.67 |
| Gemini 3.8 Flash | 96.3% | yes | 11.43 |
| Gemma 4 26B | 95.1% (looped once in an earlier run) | yes | 0.13 |
| Mistral Small 2603 | 66.7% (failed one page) | no | 0.38 |
| qwen3-vl-8b | 74.1% (looped on one page) | no | 0.86 |

**A loop is billed in full.** Gemma and qwen3-vl-8b each produced the 8,192-token
maximum on a diagram page and hit the 120s timeout. Cloud OCR must cap output
(about 3,000 tokens is plenty for a dense page).

### Repeats (3-4 runs each, leading models)

| Model | Hallucination | Tools | Flashcards | Quiz | Advising | $/1k chat turns | $/1k quizzes | $/1k flashcard sets |
|---|---|---|---|---|---|---|---|---|
| **Gemma 4 26B** | 12/12 | **9/9** | 3/3 | 3/3 | 3/3 | 0.28 | 0.88 | 0.24 |
| Qwen3.7-Flash | 16/16 | 10/12 | 4/4 | 4/4 | 4/4 | **0.10** | **0.33** | **0.13** |
| GLM-5.3-Flash | 12/12 | 6/9 | 3/3 | 3/3 | 3/3 | 0.33 | 0.56 | 1.52 |
| Gemini 3.1 Flash-Lite | 12/12 | 9/9 | 3/3 | 3/3 | 3/3 | 0.92 | 3.29 | 1.24 |
| Gemini 3.5 Flash-Lite | 12/12 | 9/9 | 3/5 | 3/5 | 3/3 | 1.27 | 6.16 | 1.95 |

The tool misses are all the calendar case:
- **GLM-5.3** answered in text instead of calling the tool (3 of 3 runs).
- **Qwen3.7** once sent "October 6, 2026 2:00 PM" instead of an ISO time. The
  benchmark's tool schema doesn't state the format. The production schema
  should, which may fix this.

### Recommended per-feature models

| Feature | Model | Why |
|---|---|---|
| Chat with tools, advising | **Gemma 4 26B** (OpenRouter) | Only model at 100% on chat, tools and advising across every repeat; about $0.28 per 1,000 turns |
| Quiz, flashcards, practice | **Qwen3.7-Flash** (OpenRouter) | Every generation passed; cheapest by 2-3x |
| OCR | **GLM-5.3-Flash** (OpenRouter) | Perfect on real handwriting, faithful to what's written; under $0.001 a page |
| Fallback if OpenRouter is down | Gemini 3.1 Flash-Lite (Google direct) | Reliable everywhere, 3-4x the price |

**Total benchmark spend for both rounds: about $0.38.**
