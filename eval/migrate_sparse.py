#!/usr/bin/env python3
"""
migrate_sparse.py -- Reconfigura únicamente la colección de textos 
sin perder las imágenes ya indexadas ni afectar a otras colecciones de Qdrant.
"""

from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct
from retrieval_system import ImageRetrievalSystem
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Migrador")

def filtrar_y_recrear():
    # 1. Inicializar el sistema SIN el reset global (reset_index=False obligatorio)
    system = ImageRetrievalSystem(reset_index=False)
    
    # El nombre específico de tu colección de textos
    target_collection = system.text_collection 
    
    logger.info(f"Destruyendo EXCLUSIVAMENTE la colección: '{target_collection}'...")
    # Esto SOLO borra esta colección. Las demás colecciones de tu Qdrant quedan intactas.
    system.client.delete_collection(collection_name=target_collection)
    
    logger.info(f"Recreando '{target_collection}' con la nueva estructura híbrida...")
    # Al no existir, ensure_collection la creará con la configuración Dense + Sparse
    system.ensure_collection()
    
    # 2. Recuperar las descripciones ya existentes de la colección "imagenes"
    logger.info("Recuperando descripciones de la colección de imágenes para repoblar...")
    puntos_imagenes, _ = system.client.scroll(
        collection_name=system.image_collection,
        limit=10000,
        with_payload=True,
        with_vectors=False
    )
    
    if not puntos_imagenes:
        logger.info("La colección de imágenes estaba vacía. Estructura actualizada y lista para nuevos uploads.")
        return

    logger.info(f"Generando vectores dispersos para {len(puntos_imagenes)} imágenes existentes...")
    
    # Resetear el contador de IDs de texto para la nueva colección limpia
    system.last_text_id = 0
    
    for punto in puntos_imagenes:
        img_id = punto.payload["img_id"]
        descripcion = punto.payload["image_description"]
        path = punto.payload["path"]
        
        # Fragmentar el texto exactamente igual que en el pipeline original
        segments = system.split_description(descripcion)
        all_texts = [" ".join(segments)] + segments
        
        text_points = []
        for text in all_texts:
            system.last_text_id += 1
            # Extraer el par híbrido (Denso + Disperso) usando el nuevo BGE-M3 local
            dense_vec, sparse_vec = system._embed_text_hybrid(text)
            
            point = PointStruct(
                id=system.last_text_id,
                vector={
                    "semantico": dense_vec,
                    "lexico": sparse_vec
                },
                payload={
                    "img_id":        img_id,
                    "segment_id":    system.last_text_id,
                    "segment_text":  text,
                    "path":          path,
                }
            )
            text_points.append(point)
            
        if text_points:
            system.client.upsert(
                collection_name=target_collection,
                points=text_points
            )
            
    logger.info(f"¡Migración completada con éxito! Se han regenerado {system.last_text_id} segmentos híbridos.")

if __name__ == "__main__":
    filtrar_y_recrear()