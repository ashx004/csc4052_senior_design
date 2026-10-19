# Catalyst model benchmark

Generated 2026-10-18T16:08:29.469Z against hosted providers through scripts/cloudOllamaShim.ts (tok/s is end-to-end wall time, including network).

| Model | Hallucination | Tools | Flashcards s | Quiz s | Advising valid | Advising s | Parallel tok/s | OCR word recall | OCR CER | Handwriting facts | Errors | Run $ | $/1k chat turns | $/1k flashcard sets | $/1k quizzes | $/1k advising plans | $/1k OCR pages |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| openrouter:google/gemma-4-26b-a4b-it | 4/4 | 3/3 | 40.95 | 31.19 | yes | 17.92 | — | — | — | — | 0 | 0.003741 | 0.25 | 0.26 | 1.36 | 0.17 | — |
| openrouter:z-ai/glm-5.3-flash | 4/4 | 2/3 | 9.34 | 33.32 | yes | 3.4 | — | — | — | — | 0 | 0.005023 | 0.33 | 1.35 | 0.65 | 0.51 | — |
| openrouter:qwen/qwen3.7-flash | 4/4 | 3/3 | 6.43 | 20.83 | yes | 21.79 | — | — | — | — | 0 | 0.001427 | 0.1 | 0.13 | 0.32 | 0.31 | — |
| google:gemini-3.1-flash-lite | 4/4 | 3/3 | 2.73 | 64.2 | yes | 58.56 | — | — | — | — | 0 | 0.011604 | 0.92 | 1.24 | 3.29 | 0.8 | — |
| google:gemini-3.5-flash-lite | 4/4 | 3/3 | 2.39 | 6.09 | yes | 1.12 | — | — | — | — | 0 | 0.019193 | 1.16 | 1.97 | 5.69 | 1.13 | — |
