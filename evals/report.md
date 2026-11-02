# DocMind eval report

31 golden cases · 27 answerable · embeddings: ollama:nomic-embed-text · answers: groq:openai/gpt-oss-120b

## Retrieval (top 5)

| Retriever | Recall@1 | Recall@3 | Recall@5 | MRR | Avg latency |
|---|---|---|---|---|---|
| vector | 96% | 100% | 100% | 0.98 | 42 ms |
| keyword | 70% | 89% | 89% | 0.80 | 2 ms |
| **hybrid (RRF)** | 93% | 96% | 100% | 0.95 | 28 ms |

Hybrid misses: none

## Access control

Forbidden documents retrieved: **0** (must be 0)

## Answers

Passed **30/31** (97%)

| Kind | Passed |
|---|---|
| paraphrase | 11/12 |
| direct | 8/8 |
| exact | 5/5 |
| unanswerable | 2/2 |
| private | 2/2 |
| permission | 2/2 |

Average faithfulness (LLM judge, 1–5): **4.93** over 27 answers

### Failures

- **leave-annual** — judge: faithfulness 3/5  
  > You receive 24 days of paid annual leave, 10 days of paid sick leave, and the company observes 12 paid public holidays each year, giving you a total of 46 paid days off annually [1][3][4]. Birthing parents also get 26 weeks of fully paid pa
