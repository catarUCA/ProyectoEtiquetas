import math
import numpy as np


def _dcg(gains):
    return sum(g / math.log2(i + 2) for i, g in enumerate(gains))


def ndcg_at_k(ranked_ids, qrels, k):
    gains = [(2 ** qrels.get(i, 0) - 1) for i in ranked_ids[:k]]
    dcg = _dcg(gains)
    ideal = sorted(qrels.values(), reverse=True)[:k]
    idcg = _dcg([2 ** g - 1 for g in ideal])
    return dcg / idcg if idcg > 0 else 0.0


def average_precision(ranked_ids, qrels, k=None):
    rel_total = sum(1 for g in qrels.values() if g > 0)
    if rel_total == 0:
        return 0.0
    ranked = ranked_ids[:k] if k else ranked_ids
    hits, ap = 0, 0.0
    for i, iid in enumerate(ranked):
        if qrels.get(iid, 0) > 0:
            hits += 1
            ap += hits / (i + 1)
    return ap / rel_total


def precision_at_k(ranked_ids, qrels, k):
    if k == 0:
        return 0.0
    return sum(1 for i in ranked_ids[:k] if qrels.get(i, 0) > 0) / k


def mrr(ranked_ids, qrels):
    for i, iid in enumerate(ranked_ids):
        if qrels.get(iid, 0) > 0:
            return 1.0 / (i + 1)
    return 0.0


def paired_permutation_test(a, b, n=10000, seed=0):
    rng = np.random.default_rng(seed)
    diff = np.array(a, dtype=float) - np.array(b, dtype=float)
    obs = diff.mean()
    count = sum(
        abs((diff * rng.choice([1, -1], size=len(diff))).mean()) >= abs(obs)
        for _ in range(n)
    )
    return obs, (count + 1) / (n + 1)


def bootstrap_ci(values, n=10000, alpha=0.05, seed=0):
    rng = np.random.default_rng(seed)
    vals = np.array(values, dtype=float)
    means = [rng.choice(vals, size=len(vals), replace=True).mean() for _ in range(n)]
    lo, hi = np.percentile(means, [100 * alpha / 2, 100 * (1 - alpha / 2)])
    return float(vals.mean()), float(lo), float(hi)
