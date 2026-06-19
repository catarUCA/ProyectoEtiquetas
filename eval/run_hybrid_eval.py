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
# CONFIGURACIÓN DE RUTAS ABSOLUTAS (Inmune a Windows y tipos de datos)
# =====================================================================
_HERE = Path(__file__).resolve().parent     # C:\Users\User\Documents\ProyectoEtiquetas\eval
_ROOT = _HERE.parent                        # C:\Users\User\Documents\ProyectoEtiquetas

# Ruta exacta hacia el archivo de recuperacion
_TARGET_DIR = _ROOT / "source" / "Sistema-de-catalogacion-de-imagenes"

if _TARGET_DIR.exists():
    if str(_TARGET_DIR) not in sys.path:
        sys.path.insert(0, str(_TARGET_DIR))
else:
    print(f"⚠️ ¡Ojo! No se encontró la carpeta en: {_TARGET_DIR}")

if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
# =====================================================================

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("HybridEval")


def print_header(title):
    print(f"\n{'='*70}")
    print(f"  🚀 {title}")
    print('=' * 70)


def translate_internal_id(internal_id: int, base_id: int = 51) -> int:
    """
    Traduce los IDs secuenciales de producción de Qdrant (ej. 51-100)
    al formato de identificadores de la muestra de evaluación (101-510).
    """
    offset = internal_id - base_id
    if 0 <= offset < 50:
        group = (offset // 10) + 1
        index = (offset % 10) + 1
        return group * 100 + index
    return None


def main():
    print_header("EVALUACIÓN DEL NUEVO SISTEMA HÍBRIDO (BGE-M3 + QDRANT RRF)")

    # 1. Importar componentes del sistema y métricas
    try:
        from retrieval_system import ImageRetrievalSystem
        from eval.metrics import ndcg_at_k, average_precision, precision_at_k, mrr
        logger.info("Módulos del sistema y métricas cargados con éxito.")
    except ImportError as e:
        logger.error(f"Error al importar dependencias: {e}")
        sys.exit(1)

    # 2. Conectar al sistema de recuperación
    try:
        rs = ImageRetrievalSystem(reset_index=False)
        total_segmentos = rs.client.count(rs.text_collection).count
        logger.info(f"Conectado a Qdrant. Segmentos de texto indexados en la BD: {total_segmentos}")
    except Exception as e:
        logger.error(f"No se pudo conectar a Qdrant o inicializar BGE-M3: {e}")
        sys.exit(1)

    # 3. Cargar consultas y juicios de relevancia apuntando siempre al ROOT
    queries_path = _ROOT / "data" / "queries.csv"
    qrels_path = _ROOT / "data" / "qrels.json"

    if not qrels_path.exists():
        logger.error(f"Falta el archivo qrels.json en la ruta: {qrels_path}")
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
        logger.warning("data/queries.csv no encontrado en la raíz. Usando fallback piloto.")
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
    
    # Auto-detectar dinámicamente el bloque base de indexación
    sample_points, _ = rs.client.scroll(collection_name=rs.text_collection, limit=10)
    detected_base = 51
    if sample_points:
        min_id = min(int(p.payload["img_id"]) for p in sample_points)
        if min_id < 51:
            detected_base = 1
    logger.info(f"Base de traducción mapeada automáticamente partiendo del ID interno: {detected_base}")

    for q_id, q_info in queries.items():
        q_text = q_info["text"]
        q_type = q_info["type"]
        
        if q_id not in qrels:
            continue
            
        hits = rs.search_by_text(q_text)
        
        # Mapear los IDs de los aciertos traduciéndolos al dataset de evaluación (101-510)
        ranked_ids = []
        for hit in hits:
            eval_id = translate_internal_id(int(hit["id"]), base_id=detected_base)
            if eval_id is not None and eval_id not in ranked_ids:
                ranked_ids.append(eval_id)
            if len(ranked_ids) >= 10:
                break
        
        # Adaptación de escala binaria o graduada de qrels.json al formato estricto de eval.metrics
        has_graded_scale = any(int(v) >= 2 for v in qrels[q_id].values())
        if has_graded_scale:
            current_qrels = {int(k): 1 for k, v in qrels[q_id].items() if int(v) >= 2}
        else:
            current_qrels = {int(k): 1 for k, v in qrels[q_id].items() if int(v) == 1}
        
        # Cómputo de métricas individuales
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
    print('-' * 85)
    print(f"{'Configuración / Tipo Query':<30} | {'nDCG@10':<8} | {'MAP':<6} | {'P@5':<5} | {'P@10':<6} | {'MRR':<5}")
    print('-' * 85)

    global_metrics = {"ndcg10": [], "map": [], "p5": [], "p10": [], "mrr": []}

    for q_type, metrics_list in results_by_type.items():
        if not metrics_list:
            continue
        avg_ndcg = sum(m["ndcg10"] for m in metrics_list) / len(metrics_list)
        avg_map = sum(m["map"] for m in metrics_list) / len(metrics_list)
        avg_p5 = sum(m["p5"] for m in metrics_list) / len(metrics_list)
        avg_p10 = sum(m["p10"] for m in metrics_list) / len(metrics_list)
        avg_mrr = sum(m["mrr"] for m in metrics_list) / len(metrics_list)
        
        print(f"ocr_vlm_hybrid ({q_type:<12})     | {avg_ndcg:.3f}   | {avg_map:.3f} | {avg_p5:.3f} | {avg_p10:.3f} | {avg_mrr:.3f}")
        
        global_metrics["ndcg10"].append(avg_ndcg)
        global_metrics["map"].append(avg_map)
        global_metrics["p5"].append(avg_p5)
        global_metrics["p10"].append(avg_p10)
        global_metrics["mrr"].append(avg_mrr)

    print('-' * 85)
    if global_metrics["ndcg10"]:
        agg_ndcg = sum(global_metrics["ndcg10"]) / len(global_metrics["ndcg10"])
        agg_map = sum(global_metrics["map"]) / len(global_metrics["map"])
        agg_p5 = sum(global_metrics["p5"]) / len(global_metrics["p5"])
        agg_p10 = sum(global_metrics["p10"]) / len(global_metrics["p10"])
        agg_mrr = sum(global_metrics["mrr"]) / len(global_metrics["mrr"])
    else:
        agg_ndcg = agg_map = agg_p5 = agg_p10 = agg_mrr = 0.0
        
    print(f"✨ AGREGADO HÍBRIDO (MÉTRICA NUEVA) | {agg_ndcg:.3f}   | {agg_map:.3f} | {agg_p5:.3f} | {agg_p10:.3f} | {agg_mrr:.3f}")
    print('-' * 85)
    
    print("\n💡 Comparativa con las métricas del artículo científico anterior:")
    print("  - viejo 'ocr_vlm' (Densa):     nDCG@10 = 0.668  |  MAP = 0.495")
    print("  - viejo 'bm25_fusion' (Léxica): nDCG@10 = 0.708  |  MAP = 0.594")
    print("\nVerifica si tu 'AGREGADO HÍBRIDO' supera el 0.708 de nDCG. ¡Esa será tu victoria!")
    print('=' * 70 + "\n")


if __name__ == "__main__":
    main()