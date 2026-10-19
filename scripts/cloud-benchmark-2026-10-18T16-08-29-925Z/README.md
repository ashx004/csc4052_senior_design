# Catalyst model benchmark

Generated 2026-10-18T16:14:19.204Z against hosted providers through scripts/cloudOllamaShim.ts (tok/s is end-to-end wall time, including network).

| Model | Hallucination | Tools | Flashcards s | Quiz s | Advising valid | Advising s | Parallel tok/s | OCR word recall | OCR CER | Handwriting facts | Errors | Run $ | $/1k chat turns | $/1k flashcard sets | $/1k quizzes | $/1k advising plans | $/1k OCR pages |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| openrouter:google/gemma-4-26b-a4b-it | 4/4 | 3/3 | 19.8 | 46.19 | yes | 6.63 | — | — | — | — | 0 | 0.003155 | 0.31 | 0.26 | 0.56 | 0.32 | — |
| openrouter:z-ai/glm-5.3-flash | 4/4 | 2/3 | 16.61 | 28.29 | yes | 3.45 | — | — | — | — | 0 | 0.005283 | 0.29 | 2.07 | 0.44 | 0.49 | — |
| openrouter:qwen/qwen3.7-flash | 4/4 | 3/3 | 6.03 | 19.77 | yes | 32 | — | — | — | — | 0 | 0.001667 | 0.11 | 0.12 | 0.31 | 0.47 | — |
| google:gemini-3.1-flash-lite | 4/4 | 3/3 | 2.49 | 12.66 | yes | 1.58 | — | — | — | — | 0 | 0.011621 | 0.93 | 1.24 | 3.29 | 0.8 | — |
| google:gemini-3.5-flash-lite | 4/4 | 3/3 | 2.5 | 6.78 | yes | 1.32 | — | — | — | — | 0 | 0.021511 | 1.51 | 1.96 | 6.35 | 1.15 | — |
