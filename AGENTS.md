# WineEyes — ProyectoEtiquetas

## Quick reference

### Running services (must be active)
- **Qdrant**: `localhost:6333`
- **Ollama**: `localhost:11434`

### Python entry points
Always from project root: `python -m eval.<module>`

### Model names (exact, case-sensitive)
| Role        | Model              | Via    |
|-------------|--------------------|--------|
| OCR         | `glm-ocr:bf16`     | Ollama |
| VLM         | `gemma4:26b`       | Ollama |
| Embedding   | `bge-m3:latest`    | Ollama |
| CLIP visual | ViT-L-14           | Local  |

### Key files
| What                         | Path                                                  |
|------------------------------|-------------------------------------------------------|
| Paper (LaTeX)                | `etiquetasSoftwareOverleaf/paper/main.tex`             |
| References                   | `etiquetasSoftwareOverleaf/paper/references.bib`       |
| Eval queries                 | `data/queries.csv`                                    |
| Relevance judgements (qrels) | `data/qrels.json`                                     |
| OCR+VLM cache                | `data/ablation_cache.json`                            |
| Rankings (all systems)       | `results/rankings.json`                               |
| Retrieval metrics            | `results/retrieval_metrics.json`                      |
| VLM quality metrics          | `results/quality_metrics.json`                        |
| Jaccard overlap              | `results/rankings_overlap.json`                       |

## Critical conventions

### Qdrant
- `imagenes`, `segmentos_texto`: production, NEVER delete/reindex
- `eval_fus_*`, `eval_seg_*`: disposable eval collections
- NEVER pass `reset_index=True` to `get_rs()`

### Image IDs
- Sample IDs: strings like `"3_03"` (folder_index zero-padded)
- Full-DB IDs: integers 1..N
- DO NOT run `int("3_03")` — it becomes 303, corrupting metrics

### Rankings / metrics pipeline
1. Run search (ablation_fusion or baselines) writes `rankings.json`
2. `recompute_metrics.py` reads rankings + qrels, writes `retrieval_metrics.json`
3. Rankings.json holds ALL systems together

### Encoding
Always: `sys.stdout.reconfigure(encoding='utf-8')` for spanish chars in PowerShell.

### Paper
- Use `\TODO{text}` (red bold in preamble), never `\todo{}`
- Labels: `tab:retrieval_metrics`, `tab:jaccard`, `tab:vlm_quality`, `tab:example_heraldic`
- 0 references to "companion study"; evaluation presented as completed

### Known bugs / pitfalls
- `search_by_text` returns list of dicts with keys `id, path, score, text`
- `search_by_text` has NO `k` or `top_k` argument; truncate manually
- `run_retrieval.py` searches full DB (integer IDs), NOT the sample
- CLIP in Qdrant `imagenes` only has 62 production images; sample images must be encoded locally
- Owl's `scroll` API: filter goes in `scroll_filter` kwarg, not `filter`
