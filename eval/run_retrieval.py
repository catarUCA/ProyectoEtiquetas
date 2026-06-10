import csv
import json
import sys
import os
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "source", "Sistema-de-catalogacion-de-imagenes"))

from eval.utils import get_rs, ensure_dirs
from eval.systems import OwnSystem, ClipSystem, Bm25System
from eval.metrics import (ndcg_at_k, average_precision, precision_at_k, mrr,
                          paired_permutation_test)

K = 10
QUERIES = "data/queries.csv"
QRELS = "data/qrels.json"
RANKINGS = "results/rankings.json"


def load_queries(path=QUERIES):
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def run_and_save(systems, queries):
    rankings = defaultdict(dict)
    for q in queries:
        qid, text = q["query_id"], q["query"]
        print(f"\n=== {qid}: '{text}' ===")
        for s in systems:
            hits = s.search(text, K)
            rankings[qid][s.name] = [h.img_id for h in hits]
            print(f"  {s.name:14s} -> {', '.join(str(h.img_id) for h in hits[:5])}")
    ensure_dirs()
    with open(RANKINGS, "w") as f:
        json.dump(rankings, f, indent=2)
    return rankings


def evaluate(rankings, queries):
    if not os.path.exists(QRELS):
        print("\n[info] Sin qrels: solo comparacion cualitativa.")
        return
    qrels_all = json.load(open(QRELS))
    qtype = {q["query_id"]: q.get("type", "todas") for q in queries}

    glob = defaultdict(lambda: defaultdict(list))
    bytype = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for qid, by_sys in rankings.items():
        qrels = {int(i): int(g) for i, g in qrels_all.get(qid, {}).items()}
        if not qrels:
            continue
        for sysname, ranked in by_sys.items():
            vals = {
                "ndcg": ndcg_at_k(ranked, qrels, K),
                "map": average_precision(ranked, qrels),
                "p": precision_at_k(ranked, qrels, K),
                "mrr": mrr(ranked, qrels),
            }
            for m, v in vals.items():
                glob[sysname][m].append(v)
                bytype[qtype[qid]][sysname][m].append(v)

    def tabla(d, titulo):
        print(f"\n=== {titulo} (k={K}) ===")
        print(f"{'sistema':14s}  nDCG    mAP     P@k     MRR")
        for sysname, m in d.items():
            print(f"{sysname:14s}  " + "   ".join(
                f"{sum(m[x])/len(m[x]):.3f}" for x in ("ndcg", "map", "p", "mrr")))

    tabla(glob, "AGREGADO")
    for t, d in bytype.items():
        tabla(d, f"TIPO = {t}")

    own = "own_bge_m3"
    if own in glob:
        print("\n=== Significancia (nDCG, permutacion pareada) ===")
        for sysname, m in glob.items():
            if sysname == own:
                continue
            diff, p = paired_permutation_test(glob[own]["ndcg"], m["ndcg"])
            print(f"  {own} vs {sysname}: dif={diff:+.3f}  p={p:.4f}")


def main():
    rs = get_rs()
    systems = [OwnSystem(rs), ClipSystem(rs), Bm25System(rs)]
    queries = load_queries(QUERIES)
    rankings = run_and_save(systems, queries)
    evaluate(rankings, queries)


if __name__ == "__main__":
    main()
