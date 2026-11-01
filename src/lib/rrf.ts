/**
 * Reciprocal Rank Fusion — merges several ranked lists into one.
 *
 *   score(doc) = Σ over lists  1 / (k + rank_in_list)
 *
 * Why RRF instead of adding raw scores: cosine distance and ts_rank live on completely different
 * scales, so they can't be summed meaningfully. RRF only uses *rank positions*, needs no tuning
 * per dataset, and rewards results that appear high in more than one list.
 * k = 60 is the constant from the original paper (Cormack et al., 2009); it damps the advantage
 * of the very top ranks so one list can't dominate.
 */
export interface Fused<T> {
  item: T;
  score: number;
  /** 1-based rank of this item in each input list, or null if it wasn't in that list. */
  ranks: (number | null)[];
}

export function reciprocalRankFusion<T>(
  lists: T[][],
  key: (item: T) => string,
  k = 60,
): Fused<T>[] {
  const byKey = new Map<string, Fused<T>>();

  lists.forEach((list, listIdx) => {
    list.forEach((item, i) => {
      const id = key(item);
      let entry = byKey.get(id);
      if (!entry) {
        entry = { item, score: 0, ranks: lists.map(() => null) };
        byKey.set(id, entry);
      }
      if (entry.ranks[listIdx] !== null) return; // ignore duplicates within one list
      entry.ranks[listIdx] = i + 1;
      entry.score += 1 / (k + i + 1);
    });
  });

  return [...byKey.values()].sort((a, b) => b.score - a.score);
}
