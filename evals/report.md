# DocMind eval report

31 golden cases · 27 answerable · embeddings: nomic-embed-text

## Retrieval (top 5)

| Retriever | Recall@1 | Recall@3 | Recall@5 | MRR | Avg latency |
|---|---|---|---|---|---|
| vector | 96% | 100% | 100% | 0.98 | 89 ms |
| keyword | 70% | 89% | 89% | 0.80 | 3 ms |
| **hybrid (RRF)** | 93% | 96% | 100% | 0.95 | 25 ms |

Hybrid misses: none

## Access control

Forbidden documents retrieved: **0** (must be 0)
