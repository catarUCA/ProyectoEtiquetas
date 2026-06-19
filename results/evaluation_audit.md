# WineEyes evaluation audit

Generated: `2026-06-19T11:32:31.166940+00:00`
Overall status: **PASS**

| Check | Status | Critical | Detail |
|---|---:|---:|---|
| `query_count` | pass | True | found=15 expected=15 |
| `ocr_count` | pass | True | found=50 expected=50 |
| `ocr_canonical_ids` | pass | True | missing=[] unknown=[] |
| `ocr_nonempty` | pass | True | empty=[] |
| `vlm_solo_count` | pass | True | found=50 expected=50 |
| `vlm_solo_canonical_ids` | pass | True | missing=[] unknown=[] |
| `vlm_solo_nonempty` | pass | True | empty=[] |
| `vlm_fusion_count` | pass | True | found=50 expected=50 |
| `vlm_fusion_canonical_ids` | pass | True | missing=[] unknown=[] |
| `vlm_fusion_nonempty` | pass | True | empty=[] |
| `representation_id_sets_identical` | pass | True | ocr/vlm_solo/vlm_fusion |
| `image_count` | pass | True | found=50 missing=[] |
| `qrels_query_coverage` | pass | True | missing=[] extra=[] |
| `qrels_ids_known` | pass | True | unknown=[] |
| `queries_have_qrels` | pass | True | missing=[] |
| `qrels_format` | pass | True | binary=True path=data\qrels.json |
| `qdrant_available` | pass | True | connected |
| `collection_solo_ocr` | skip | False | not built yet: wineeyes_eval_solo_ocr_dense |
| `collection_solo_vlm` | skip | False | not built yet: wineeyes_eval_solo_vlm_dense |
| `collection_ocr_vlm` | skip | False | not built yet: wineeyes_eval_ocr_vlm_dense |
| `collection_ocr_vlm_hybrid_full` | skip | False | not built yet: wineeyes_eval_ocr_vlm_hybrid_full |
| `collection_ocr_vlm_hybrid_segmented` | skip | False | not built yet: wineeyes_eval_ocr_vlm_hybrid_segmented |
| `rankings_full_exists` | skip | False | not generated yet |
