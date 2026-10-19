# Catalyst model benchmark

Generated 2026-10-18T13:33:15.105Z against hosted providers through scripts/cloudOllamaShim.ts (tok/s is end-to-end wall time, including network).

| Model | Hallucination | Tools | Flashcards s | Quiz s | Advising valid | Advising s | Parallel tok/s | OCR word recall | OCR CER | Errors | Run $ | $/1k chat turns | $/1k flashcard sets | $/1k quizzes | $/1k advising plans | $/1k OCR pages |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| openrouter:z-ai/glm-4.7-flash | 4/4 | 2/3 | 20.37 | 24.13 | yes | 22 | 32.93 | — | — | 1 | 0.004417 | 0.44 | 0.3 | 0.71 | 0.66 | 0 |
| openrouter:z-ai/glm-5.3-flash | 4/4 | 2/3 | 9.39 | 35.13 | yes | 2.41 | 580.1 | 1 | 0 | 0 | 0.005998 | 0.36 | 1.15 | 0.58 | 0.46 | 0.27 |
| openrouter:qwen/qwen3.6-35b-a3b | 4/4 | 2/3 | 19.57 | 26.44 | yes | 53.09 | 169.4 | 1 | 0 | 0 | 0.011298 | 0.61 | 0.69 | 1.44 | 2.52 | 0.6 |
| openrouter:qwen/qwen3.7-flash | 4/4 | 2/3 | 9.15 | 30.59 | yes | 26.12 | 184.82 | 0.955 | 0.011 | 0 | 0.002305 | 0.09 | 0.13 | 0.39 | 0.35 | 0.3 |
| openrouter:google/gemma-4-26b-a4b-it | 4/4 | 3/3 | 6.24 | 23.53 | yes | 2.29 | 245.7 | 1 | 0 | 0 | 0.003576 | 0.28 | 0.2 | 0.73 | 0.17 | 0.1 |
| openrouter:deepseek/deepseek-v3.2 | 3/4 | 2/3 | 11.58 | 32.63 | yes | 3.99 | 100.58 | — | — | 1 | 0.009478 | 0.71 | 0.62 | 1.23 | 0.62 | 0 |
| groq:openai/gpt-oss-120b | FAIL | FAIL | 1.8 | — | no | — | — | — | — | 6 | 0.0011 | 0 | 0.57 | 0 | 0 | 0 |
| groq:openai/gpt-oss-20b | FAIL | FAIL | 0.74 | — | no | — | — | — | — | 6 | 0.000467 | 0 | 0.24 | 0 | 0 | 0 |
| google:gemini-3.5-flash-lite | 4/4 | 3/3 | — | — | yes | 1.66 | — | 0.955 | 0.011 | 3 | 0.012999 | 1.13 | 0 | 0 | 1.13 | 0.74 |
| google:gemini-3.1-flash-lite | FAIL | FAIL | 1.89 | 4.61 | yes | 101.51 | — | 0.955 | 0.011 | 3 | 0.009785 | 0.68 | 1.24 | 3.29 | 0.8 | 0.54 |
| google:gemini-3.8-flash | 4/4 | 2/3 | 6.76 | 15.16 | yes | 5.41 | 147.53 | 0.955 | 0.011 | 0 | 0.063042 | 3.79 | 3.64 | 8.71 | 4.23 | 7.63 |
