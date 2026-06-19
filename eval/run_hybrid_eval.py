#!/usr/bin/env python3
"""
eval/run_hybrid_eval.py -- Orquestador enfocado exclusivamente en validar el rendimiento híbrido.
Sustituye la evaluación densa clásica por el motor híbrido (Dense + Sparse via RRF).
"""

import os
import sys
import json
from pathlib import Path
import logging

# =====================================================================
# ESCÁNER AUTOMÁTICO DE RUTAS (Busca retrieval_system.py donde sea que esté)
# =====================================================================
_HERE = Path(__file__).resolve().parent + "/source/Sistema-de-catalogacion-de-imagenes"
_ROOT = _HERE.parent if _HERE.name == "eval" else _HERE

# Escaneamos recursivamente para encontrar la carpeta exacta de retrieval_system.py
target_dir = None
for p in _ROOT.rglob("retrieval_system.py"):
    target_dir = p.parent
    break

if target_dir:
    if str(target_dir) not in sys.path:
        sys.path.insert(0, str(target_dir))
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
# =====================================================================

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("HybridEval")

def print_header(title):
    print(f"\n{'='*70}")
    print(f"  🚀 {title}")
    print('=' * 70)

def main():
    print_header("EVALUACIÓN DEL NUEVO SISTEMA HÍBRIDO (BGE-M3 + QDRANT RRF)")

    # 1. Importar componentes del sistema y métricas
    try:
        from retrieval_system import ImageRetrievalSystem
        from eval.metrics import ndcg_at_k, average_precision, precision_at_k, mrr
        logger.info("Módulos del sistema y métricas cargados con éxito.")
    except ImportError as e:
        logger.error(f"Error al importar dependencias. Asegúrate de tener instalado FlagEmbedding y tus módulos locales: {e}")
        sys.exit(1)

    # 2. Conectar al sistema de recuperación
    try:
        rs = ImageRetrievalSystem(reset_index=False)
        logger.info(f"Conectado a Qdrant. Segmentos de texto indexados en la BD: {rs.client.count(rs.text_collection).count}")
    except Exception as e:
        logger.error(f"No se pudo conectar a Qdrant o inicializar BGE-M3: {e}")
        sys.exit(1)

    # 3. Cargar consultas y juicios de relevancia
    queries_path = Path("data/queries.csv")
    qrels_path = Path("data/qrels.json")

    if not qrels_path.exists():
        logger.error("Falta el archivo 'data/qrels.json'. Necesitas los juicios de relevancia humanos para evaluar.")
        sys.exit(1)

    queries = {}
    if queries_path.exists():
        import csv
        with open(queries_path, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                queries[row['query_id']] = {
                    "text": row['query'],
                    "type": row.get('type', 'Unknown')
                }
    else:
        logger.warning("data/queries.csv no encontrado. Usando las consultas piloto del artículo.")
        queries = {
            "q01": {"text": "etiqueta de Jerez", "type": "Textual"},
            "q02": {"text": "animales", "type": "Iconographic"},
            "q03": {"text": "una mujer con flores", "type": "Relational"}
        }

    with open(qrels_path, 'r', encoding='utf-8') as f:
        qrels = json.load(f)

    # 4. Ejecutar Búsqueda Híbrida y recopilar Rankings
    print("\n🔍 Ejecutando consultas en el motor híbrido local...")
    
    results_by_type = {}
    
    for q_id, q_info in queries.items():
        q_text = q_info["text"]
        q_type = q_info["type"]
        
        if q_id not in qrels:
            continue
            
        hits = rs.search_by_text(q_text)
        ranked_ids = [int(hit["id"]) for hit in hits[:10]] 
        current_qrels = {int(k): int(v) for k, v in qrels[q_id].items()}
        
        p5 = precision_at_k(ranked_ids, current_qrels, 5)
        p10 = precision_at_k(ranked_ids, current_qrels, 10)
        ap = average_precision(ranked_ids, current_qrels)
        ndcg10 = ndcg_at_k(ranked_ids, current_qrels, 10)
        v_mrr = mrr(ranked_ids, current_qrels)
        
        if q_type not in results_by_type:
            results_by_type[q_type] = []
            
        results_by_type[q_type].append({
            "ndcg10": ndcg10,
            "map": ap,
            "p5": p5,
            "p10": p10,
            "mrr": v_mrr
        })

    # 5. Calcular promedios (Macro-Averages) y pintar la tabla comparativa
    print("\n📊 TABLA DE RENDIMIENTO DEL NUEVO SISTEMA HÍBRIDO:")
    print('-' * 75)
    print(f"{'Configuración / Tipo Query':<30} | {'nDCG@10':<8} | {'MAP':<6} | {'P@5':<5} | {'MRR':<5}")
    print('-' *75)

    global_metrics = {"ndcg10": [], "map": [], "p5": [], "p10": [], "mrr": []}

    for q_type, metrics_list in results_by_type.items():
        avg_ndcg = sum(m["ndcg10"] for m in metrics_list) / len(metrics_list)
        avg_map = sum(m["map"] for m in metrics_list) / len(metrics_list)
        avg_p5 = sum(m["p5"] for m in metrics_list) / len(metrics_list)
        avg_mrr = sum(m["mrr"] for m in metrics_list) / len(metrics_list)
        
        print(f"ocr_vlm_hybrid ({q_type:<12})     | {avg_ndcg:.3f}   | {avg_map:.3f} | {avg_p5:.3f} | {avg_mrr:.3f}")
        
        global_metrics["ndcg10"].append(avg_ndcg)
        global_metrics["map"].append(avg_map)
        global_metrics["p5"].append(avg_p5)
        global_metrics["mrr"].append(avg_mrr)

    print('-' * 75)
    agg_ndcg = sum(global_metrics["ndcg10"]) / len(global_metrics["ndcg10"])
    agg_map = sum(global_metrics["map"]) / len(global_metrics["map"])
    agg_p5 = sum(global_metrics["p5"]) / len(global_metrics["p5"])
    agg_mrr = sum(global_metrics["mrr"]) / len(global_metrics["mrr"])
    
    print(f"✨ AGREGADO HÍBRIDO (MÉTRICA NUEVA) | {agg_ndcg:.3f}   | {agg_map:.3f} | {agg_p5:.3f} | {agg_mrr:.3f}")
    print('-' * 75)
    
    print("\n💡 Comparativa con las métricas del artículo científico anterior:")
    print(f"  - viejo 'ocr_vlm' (Densa):     nDCG@10 = 0.668  |  MAP = 0.495 ")
    print(f"  - viejo 'bm25_fusion' (Léxica): nDCG@10 = 0.708  |  MAP = 0.594 ")
    print(f"\nVerifica si tu 'AGREGADO HÍBRIDO' supera el 0.708 de nDCG. ¡Esa será tu victoria!")
    print('=' * 70 + "\n")

if __name__ == "__main__":
    main()