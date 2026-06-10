import os 
os.environ['KMP_DUPLICATE_LIB_OK']='TRUE'

from qdrant_client import QdrantClient
from qdrant_client.models import (
    VectorParams, Distance, PointStruct, PointIdsList,
    OrderBy, Direction, Filter, FieldCondition, MatchAny, MatchValue, FilterSelector
)
import numpy as np
from PIL import Image
from typing import List, Tuple, Optional
from datetime import datetime
import logging
import threading
import requests
import base64
import io
import random
from io import BytesIO

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CLIP_DIM = 768
TEXT_DIM = 1024
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
TEXT_EMBED_MODEL = os.getenv("TEXT_EMBED_MODEL", "bge-m3:latest")

_clip_model = None
_clip_preprocess = None
_clip_lock = threading.Lock()


def _get_clip():
    global _clip_model, _clip_preprocess
    if _clip_model is None:
        with _clip_lock:
            if _clip_model is None:
                import torch
                import open_clip
                logger.info("Loading CLIP ViT-L-14 (CPU)...")
                _clip_model, _, _clip_preprocess = open_clip.create_model_and_transforms(
                    "ViT-L-14", pretrained="laion2b_s32b_b82k", device="cpu"
                )
                _clip_model.eval()
                logger.info("CLIP loaded")
    return _clip_model, _clip_preprocess


class ImageRetrievalSystem:
    def __init__(self, reset_index: bool = False):
        self.image_collection = "imagenes"
        self.text_collection  = "segmentos_texto"
        self.index_lock = threading.Lock()
        self.reset_index = reset_index

        qdrant_host = os.getenv("QDRANT_HOST", "localhost")
        qdrant_port = int(os.getenv("QDRANT_PORT", 6333))
        self.client = QdrantClient(host=qdrant_host, port=qdrant_port)
        
        logger.info(f"Initializing retrieval system (CLIP dim={CLIP_DIM}, TEXT dim={TEXT_DIM})")

        if reset_index:
            self.client.delete_collection(self.image_collection)
            self.client.delete_collection(self.text_collection)

        self.ensure_collection()
        self.last_image_id = self.get_last_id(self.image_collection, "img_id")
        self.last_text_id  = self.get_last_id(self.text_collection, "segment_id")
    
    def _embed_image(self, img_base64: str) -> list:
        import torch
        model, preprocess = _get_clip()
        img_bytes = base64.b64decode(img_base64)
        img = Image.open(BytesIO(img_bytes)).convert("RGB")
        with torch.no_grad():
            image = preprocess(img).unsqueeze(0)
            feats = model.encode_image(image)
            feats = feats / feats.norm(dim=-1, keepdim=True)
            return feats.squeeze(0).tolist()

    def _embed_text(self, text: str) -> list:
        r = requests.post(f"{OLLAMA_HOST}/api/embed",
                          json={"model": TEXT_EMBED_MODEL, "input": text}, timeout=60)
        r.raise_for_status()
        emb = r.json()["embeddings"][0]
        norm = np.linalg.norm(emb)
        if norm > 0:
            emb = (np.array(emb) / norm).tolist()
        return emb

    def ensure_collection(self):
        existing = [c.name for c in self.client.get_collections().collections]
        if self.image_collection not in existing:
            self.client.create_collection(
                collection_name=self.image_collection,
                vectors_config={
                    "clip": VectorParams(size=CLIP_DIM, distance=Distance.COSINE),
                }
            )
            self.client.create_payload_index(
                collection_name=self.image_collection,
                field_name="img_id",
                field_schema="integer"
            )
            logger.info(f"Coleccion '{self.image_collection}' creada")
        else:
            logger.info(f"Coleccion '{self.image_collection}' cargada")

        if self.text_collection not in existing:
            self.client.create_collection(
                collection_name=self.text_collection,
                vectors_config={
                    "semantico": VectorParams(size=TEXT_DIM, distance=Distance.COSINE),
                }
            )
            self.client.create_payload_index(
                collection_name=self.text_collection,
                field_name="segment_id",
                field_schema="integer"
            )
            logger.info(f"Coleccion '{self.text_collection}' creada")
        else:
            logger.info(f"Coleccion '{self.text_collection}' cargada")

    def split_description(self, description: str) -> list[str]:
        segments = [s.strip() for s in description.splitlines() if s.strip()]
        return segments
    
    def get_last_id(self, collection_name: str, id_field: str) -> int:
        points, _ = self.client.scroll(
            collection_name=collection_name,
            order_by=OrderBy(key=id_field, direction=Direction.DESC),
            limit=1,
            with_payload=True,
            with_vectors=False
        )
        return points[0].payload[id_field] if points else 0

    def get_metadata(self):
        points, _ = self.client.scroll(
            collection_name=self.image_collection,
            with_payload=True,
            with_vectors=False,
            limit=10000
        )
        return points

    def get_random_image(self) -> dict | None:
        total = self.client.count(collection_name=self.image_collection).count
        if total == 0:
            return None
        offset = random.randint(0, total - 1)
        points, _ = self.client.scroll(
            collection_name=self.image_collection,
            limit=1,
            offset=offset,
            with_payload=True,
            with_vectors=False,
        )
        return points[0].payload if points else None

    def index_image(self, image_dir: str, clip_vector: list, description: str, ocr_text: str = ""):
        logger.info(f"Indexing image {image_dir}")

        self.last_image_id += 1

        self.client.upsert(
            collection_name=self.image_collection,
            points=[PointStruct(
                id=self.last_image_id,
                vector={"clip": clip_vector},
                payload={
                    "img_id":            self.last_image_id,
                    "path":              image_dir,
                    "filename":          os.path.basename(image_dir),
                    "indexed_at":        datetime.now().isoformat(),
                    "image_description": description,
                    "ocr_text":          ocr_text,
                    "tags":              [],
                }
            )]
        )

        segments = self.split_description(description)
        all_texts = [" ".join(segments)] + segments

        text_features = [self._embed_text(t) for t in all_texts]

        text_points = []
        for i, text in enumerate(all_texts):
            self.last_text_id += 1
            point = PointStruct(
                id=self.last_text_id,
                vector={"semantico": text_features[i]},
                payload={
                    "img_id":        self.last_image_id,
                    "segment_id":    self.last_text_id,
                    "segment_text":  text,
                    "path":          image_dir,
                }
            )
            text_points.append(point)

        if text_points:
            self.client.upsert(
                collection_name=self.text_collection,
                points=text_points
            )

        logger.info(f"Imagen indexada con ID {self.last_image_id}, {len(text_points)} segmentos indexados\n")

    def update_description(self, img_id: int, new_description: str):
        result = self.client.retrieve(
            collection_name=self.image_collection,
            ids=[img_id],
            with_payload=True,
            with_vectors=False
        )
        if not result:
            raise ValueError(f"Imagen con id {img_id} no encontrada")

        self.client.set_payload(
            collection_name=self.image_collection,
            payload={"image_description": new_description},
            points=[img_id]
        )

        self.client.delete(
            collection_name=self.text_collection,
            points_selector=FilterSelector(
                filter=Filter(
                    must=[FieldCondition(key="img_id", match=MatchAny(any=[img_id]))]
                )
            )
        )

        segments = self.split_description(new_description)
        all_texts = [" ".join(segments)] + segments

        text_features = [self._embed_text(t) for t in all_texts]

        text_points = []
        for i, text in enumerate(all_texts):
            self.last_text_id += 1
            point = PointStruct(
                id=self.last_text_id,
                vector={"semantico": text_features[i]},
                payload={
                    "img_id":        img_id,
                    "segment_id":    self.last_text_id,
                    "segment_text":  text,
                    "path":          result[0].payload["path"],
                }
            )
            text_points.append(point)
        if text_points:
            self.client.upsert(
                collection_name=self.text_collection,
                points=text_points
            )
        logger.info(f"Descripcion actualizada para imagen {img_id}\n")

        logger.info(f"Descripción actualizada para img_id={img_id}, {len(text_points)} segmentos regenerados")

    def delete_images(self, remove_set: list[int]):
        points = self.client.retrieve(
            collection_name=self.image_collection,
            ids=remove_set,
            with_payload=True,
            with_vectors=False
        )

        self.client.delete(
            collection_name=self.image_collection,
            points_selector=PointIdsList(points=remove_set)
        )

        self.client.delete(
            collection_name=self.text_collection,
            points_selector=FilterSelector(
                filter=Filter(
                    must=[FieldCondition(key="img_id", match=MatchAny(any=remove_set))]
                )
            )
        )
        logger.info(f"Segmentos de texto eliminados para img_ids={remove_set}")

        for point in points:
            path = point.payload["path"]
            thumb_path = path.replace('/processed/', '/thumbnails/')

            for file in [path, thumb_path]:
                if os.path.exists(file):
                    os.remove(file)
                else:
                    logger.warning(f"Fichero no encontrado: {file}")

    def search_by_image(self, img_bytes: bytes, k: int = 5, distance_threshold: float = 0) -> list:
        logger.info("Searching for similar images")

        img_base64 = base64.b64encode(img_bytes).decode()
        query = self._embed_image(img_base64)

        hits = self.client.query_points(
            collection_name=self.image_collection,
            query=query,
            using="clip",
            limit=k,
            score_threshold=distance_threshold
        ).points

        results = [
            (hit.payload["path"], hit.score)
            for hit in hits
        ]

        logger.info(f"Found {len(results)} matches")
        return results
        
    def search_by_text(self, text_query, distance_threshold: float = 0.0) -> list:
        logger.info("Searching by text (dense semantic)")
        dense_vec = self._embed_text(text_query)
        hits = self.client.query_points(
            collection_name=self.text_collection,
            query=dense_vec,
            using="semantico",
            limit=10000,
            score_threshold=distance_threshold
        ).points

        seen = {}
        for hit in hits:
            img_id = hit.payload["img_id"]
            if img_id not in seen or hit.score > seen[img_id]["score"]:
                seen[img_id] = {
                    "path":  hit.payload["path"],
                    "id":    str(img_id),
                    "score": hit.score,
                    "text":  hit.payload["segment_text"]
                }

        items = list(seen.values())
        logger.info(f"Found {len(items)} semantic matches")
        return items

    def search_by_tags(self, image_ids: list[int], text_query: str = None, score_threshold: float = 0.0) -> list[dict]:
        logger.info(f"Searching by ids: {len(image_ids)}, text_query={text_query!r}")

        image_results, _ = self.client.scroll(
            collection_name=self.image_collection,
            scroll_filter=Filter(
                must=[FieldCondition(key="img_id", match=MatchAny(any=image_ids))]
            ) if image_ids else None,
            with_payload=True,
            with_vectors=False,
            limit=10000
        )

        if not image_results:
            return []

        if not text_query:
            return [
                {
                    "path":  r.payload["path"],
                    "id":    str(r.payload["img_id"]),
                    "score": 1.0,
                    "tags":  r.payload.get("tags", []),
                }
                for r in image_results
            ]

        dense_vec = self._embed_text(text_query)
        tag_filter = Filter(
            must=[FieldCondition(key="img_id", match=MatchAny(any=image_ids))]
        )
        hits = self.client.query_points(
            collection_name=self.text_collection,
            query=dense_vec,
            using="semantico",
            query_filter=tag_filter,
            limit=10000,
            score_threshold=score_threshold
        ).points

        seen = {}
        for hit in hits:
            img_id = hit.payload["img_id"]
            if img_id not in seen or hit.score > seen[img_id]["score"]:
                seen[img_id] = {
                    "path":  hit.payload["path"],
                    "id":    str(img_id),
                    "score": hit.score,
                    "text":  hit.payload["segment_text"]
                }

        ranked = sorted(seen.values(), key=lambda x: x["score"], reverse=True)
        logger.info(f"Found {len(ranked)} tag+hybrid matches")
        return ranked

    def get_all_tags(self) -> list[str]:
        points, _ = self.client.scroll(
            collection_name=self.image_collection,
            with_payload=True,
            with_vectors=False,
            limit=1000000
        )
        tags = set()
        for point in points:
            for tag in point.payload.get("tags", []):
                tags.add(tag)
        return sorted(tags)

    def add_tags(self, img_id: int, tags: list[str]):
        result = self.client.retrieve(
            collection_name=self.image_collection,
            ids=[img_id],
            with_payload=True,
            with_vectors=False
        )
        if not result:
            raise ValueError(f"Imagen con id {img_id} no encontrada")
        current_tags = result[0].payload.get("tags", [])
        updated_tags = list(set(current_tags + tags))
        self.client.set_payload(
            collection_name=self.image_collection,
            payload={"tags": updated_tags},
            points=[img_id]
        )

    def remove_tags(self, img_id: int, tags: list[str]):
        result = self.client.retrieve(
            collection_name=self.image_collection,
            ids=[img_id],
            with_payload=True,
            with_vectors=False
        )
        if not result:
            raise ValueError(f"Imagen con id {img_id} no encontrada")
        current_tags = result[0].payload.get("tags", [])
        updated_tags = [t for t in current_tags if t not in tags]
        self.client.set_payload(
            collection_name=self.image_collection,
            payload={"tags": updated_tags},
            points=[img_id]
        )

    def set_tags(self, img_id: int, tags: list[str]):
        self.client.set_payload(
            collection_name=self.image_collection,
            payload={"tags": tags},
            points=[img_id]
        )

    def search_by_tags_direct(self, tags: list[str], match_all: bool = False) -> list[int]:
        if not tags:
            return []
        if match_all:
            conditions = [FieldCondition(key="tags", match=MatchValue(value=tag)) for tag in tags]
            tag_filter = Filter(must=conditions)
        else:
            tag_filter = Filter(must=[FieldCondition(key="tags", match=MatchAny(any=tags))])
        points, _ = self.client.scroll(
            collection_name=self.image_collection,
            scroll_filter=tag_filter,
            with_payload=True,
            with_vectors=False,
            limit=1000000
        )
        return [p.id for p in points]


if __name__ == "__main__":
    import sys
    system = ImageRetrievalSystem(reset_index=False)
    print(f"Last image ID: {system.last_image_id}")
    print(f"Last text ID: {system.last_text_id}")