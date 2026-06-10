import feature_extractor as fe
from eval.utils import get_rs
from eval.folder_sample import load_folder_sample
from eval.index_variant import index_descriptions, VariantSystem
from eval.run_retrieval import load_queries, run_and_save, evaluate


def construir_items(rs, sample):
    solo_ocr, solo_vlm, fusion = [], [], []
    for r in sample:
        ocr = fe.ocr_image(r["path"])
        solo_ocr.append((r["id"], r["path"], ocr))
        solo_vlm.append((r["id"], r["path"], fe.describe_image(r["path"], "")))
        fusion.append((r["id"], r["path"], fe.describe_image(r["path"], ocr)))
    return {"eval_fus_ocr": solo_ocr, "eval_fus_vlm": solo_vlm, "eval_fus_full": fusion}


def main():
    rs = get_rs()
    sample = load_folder_sample()
    items = construir_items(rs, sample)
    for col, data in items.items():
        index_descriptions(rs, col, data, mode="full")

    systems = [
        VariantSystem(rs, "eval_fus_ocr", "solo_ocr"),
        VariantSystem(rs, "eval_fus_vlm", "solo_vlm"),
        VariantSystem(rs, "eval_fus_full", "ocr_vlm"),
    ]
    queries = load_queries("data/queries.csv")
    rankings = run_and_save(systems, queries)
    evaluate(rankings, queries)


if __name__ == "__main__":
    main()
