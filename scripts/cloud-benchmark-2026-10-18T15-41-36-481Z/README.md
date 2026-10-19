# Catalyst model benchmark

Generated 2026-10-18T15:59:40.914Z against hosted providers through scripts/cloudOllamaShim.ts (tok/s is end-to-end wall time, including network).

| Model | Hallucination | Tools | Flashcards s | Quiz s | Advising valid | Advising s | Parallel tok/s | OCR word recall | OCR CER | Handwriting facts | Errors | Run $ | $/1k chat turns | $/1k flashcard sets | $/1k quizzes | $/1k advising plans | $/1k OCR pages |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| openrouter:google/gemma-4-26b-a4b-it | — | — | — | — | no | — | — | 1 | 0 | 0.951 | 0 | 0.000879 | — | — | — | — | 0.13 |
| openrouter:z-ai/glm-5.3-flash | — | — | — | — | no | — | — | 1 | 0 | 1 | 0 | 0.005721 | — | — | — | — | 0.82 |
| openrouter:qwen/qwen3.6-35b-a3b | — | — | — | — | no | — | — | 1 | 0 | 1 | 0 | 0.017576 | — | — | — | — | 2.51 |
| openrouter:qwen/qwen3.7-flash | — | — | — | — | no | — | — | 0.955 | 0.011 | 0.988 | 0 | 0.003907 | — | — | — | — | 0.56 |
| openrouter:qwen/qwen3-vl-30b-a3b-instruct | — | — | — | — | no | — | — | 0.985 | 0.003 | 0.975 | 0 | 0.004708 | — | — | — | — | 0.67 |
| openrouter:mistralai/mistral-small-2603 | — | — | — | — | no | — | — | 1 | 0 | 0.667 | 0 | 0.002627 | — | — | — | — | 0.38 |
| google:gemini-3.1-flash-lite | — | — | — | — | no | — | — | 0.955 | 0.011 | 0.988 | 0 | 0.005158 | — | — | — | — | 0.74 |
| google:gemini-3.5-flash-lite | — | — | — | — | no | — | — | 0.955 | 0.011 | 0.988 | 0 | 0.007309 | — | — | — | — | 1.04 |
| google:gemini-3.8-flash | — | — | — | — | no | — | — | 0.955 | 0.011 | 0.963 | 0 | 0.079993 | — | — | — | — | 11.43 |
