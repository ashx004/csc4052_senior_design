# Catalyst model benchmark

Generated 2026-10-18T13:39:12.606Z against hosted providers through scripts/cloudOllamaShim.ts (tok/s is end-to-end wall time, including network).

| Model | Hallucination | Tools | Flashcards s | Quiz s | Advising valid | Advising s | Parallel tok/s | OCR word recall | OCR CER | Errors | Run $ | $/1k chat turns | $/1k flashcard sets | $/1k quizzes | $/1k advising plans | $/1k OCR pages |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| groq:openai/gpt-oss-120b | FAIL | 3/3 | 9.98 | 17.29 | yes | 20.98 | 42.14 | — | — | 2 | 0.005495 | 0.23 | 0.57 | 1.27 | 0.61 | 0 |
| groq:openai/gpt-oss-20b | FAIL | 3/3 | 10.97 | 14.74 | yes | 24 | 51.87 | — | — | 2 | 0.002346 | 0 | 0.24 | 0.44 | 0.47 | 0 |
