# DocMind eval report

31 golden cases · 27 answerable · embeddings: gemini:gemini-embedding-001

## Retrieval (top 5)

| Retriever | Recall@1 | Recall@3 | Recall@5 | MRR | Avg latency |
|---|---|---|---|---|---|
| vector | 100% | 100% | 100% | 1.00 | 1498 ms |
| keyword | 70% | 89% | 89% | 0.80 | 720 ms |
| **hybrid (RRF)** | 96% | 96% | 100% | 0.97 | 1471 ms |

Hybrid misses: none

## Access control

Forbidden documents retrieved: **0** (must be 0)
