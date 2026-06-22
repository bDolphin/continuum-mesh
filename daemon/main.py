"""
Continuum — FastAPI Memory Daemon
Location: daemon/main.py

Endpoints
  GET  /            health + current config
  GET  /health      liveness probe (for start.sh / k8s later)
  GET  /config      embedding config
  POST /config      switch embedding mode at runtime (local | openai | hash)
  POST /store       persist a memory (real embedding + provenance)
  GET  /recall      semantic search (empty query = recent memories)
  GET  /memories    list recent memories (dashboard)
  DELETE /memory/{id}
  GET  /stats       observability: counts by source app + embedding model
  POST /evaluate    MLOps: score recall quality on labeled probes (precision@k, MRR)
"""
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError, ConfigDict
from typing import List, Optional
from pathlib import Path
import os

from dotenv import load_dotenv, set_key

from memory_store import MemoryStore
from embeddings import build_provider
from ranker import Ranker, RankerConfig

import json
import connectors  # noqa: F401  (importing registers all connectors)
from core.registry import build_enabled, available
from core.pipeline import ingest

load_dotenv()


def _load_enabled_connectors():
    cfg_path = Path(__file__).parent / "config.json"
    enabled = ["chatgpt", "perplexity"]
    if cfg_path.exists():
        try:
            enabled = json.loads(cfg_path.read_text()).get("enabled_connectors", enabled)
        except Exception as e:
            print(f"⚠️  could not read config.json ({e}); using defaults")
    built = build_enabled(enabled)
    print(f"🔌 connectors enabled: {list(built)}  (registered: {available()})")
    return built


# --------------------------------------------------------------------------- #
# Config: which embedding provider is live. Mode persists to daemon/.env.
# --------------------------------------------------------------------------- #
class Config:
    def __init__(self):
        # NB: default is now "local" (real semantic), not "testing" (hash noise).
        self.embedding_mode = os.getenv("EMBEDDING_MODE", "local").lower()
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")
        self.provider = None
        self._build()

    def _build(self):
        try:
            self.provider = build_provider(self.embedding_mode, self.openai_api_key)
        except Exception as e:
            print(f"⚠️  Could not start '{self.embedding_mode}' embeddings: {e}")
            print("   Falling back to hash mode (NON-semantic — recall will be poor).")
            self.embedding_mode = "hash"
            self.provider = build_provider("hash")

    @property
    def model_id(self) -> str:
        return getattr(self.provider, "model_id", "unknown")

    def update_mode(self, mode: str, api_key: Optional[str] = None):
        if api_key:
            self.openai_api_key = api_key
        self.embedding_mode = mode.lower()
        self._build()
        return self.embedding_mode

    def save_to_env(self):
        env_path = Path(__file__).parent / ".env"
        if not env_path.exists():
            env_path.touch()
        set_key(str(env_path), "EMBEDDING_MODE", self.embedding_mode)
        if self.openai_api_key:
            set_key(str(env_path), "OPENAI_API_KEY", self.openai_api_key)


config = Config()
app = FastAPI(title="Continuum Memory Daemon", version="0.3.0")


@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError):
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Persist alongside the daemon regardless of where it's launched from.
store = MemoryStore(persist_directory=str(Path(__file__).parent / "chroma_db"))

# Pluggable connectors (seam #3). Plug in/out via config.json — no code change.
CONNECTORS = _load_enabled_connectors()

# Composite ranker (Cycle 2). Mode via RANKER env or ranker.json.
ranker = Ranker(RankerConfig.load(str(Path(__file__).parent / "ranker.json")))
print(f"🏅 ranker mode: {ranker.cfg.mode}  weights={ranker.cfg.weights}")


def search(query: str, top_k: int, source_app: Optional[str] = None):
    """
    Shared retrieval path for BOTH /recall and /evaluate so the eval gate
    measures exactly what users get: embed -> cosine candidate pool -> rerank.
    """
    emb = config.provider.embed(query)
    pool = ranker.candidate_pool_size(top_k)
    candidates = store.recall(
        query_embedding=emb.vector,
        n_results=pool,
        source_app=source_app,
        query_model=emb.model_id,
    )
    return ranker.rerank(candidates, query, top_k)


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #
class StoreRequest(BaseModel):
    text: str
    source_app: str
    tags: Optional[List[str]] = []
    url: Optional[str] = None
    conversation_id: Optional[str] = None
    message_type: Optional[str] = None
    model_config = ConfigDict(extra="ignore")


class ConfigUpdateRequest(BaseModel):
    embedding_mode: str
    openai_api_key: Optional[str] = None
    persist: bool = True
    model_config = ConfigDict(extra="ignore")


class EvalProbe(BaseModel):
    query: str
    relevant_ids: List[str]  # memory ids that SHOULD surface for this query
    model_config = ConfigDict(extra="ignore")


class EvaluateRequest(BaseModel):
    probes: List[EvalProbe]
    k: int = 5
    model_config = ConfigDict(extra="ignore")


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #
@app.get("/")
async def root():
    return {
        "status": "Continuum Memory Daemon is running",
        "embedding_mode": config.embedding_mode,
        "embedding_model": config.model_id,
        "memories": store.count(),
    }


@app.get("/health")
async def health():
    return {"ok": True, "embedding_mode": config.embedding_mode, "memories": store.count()}


@app.get("/config")
async def get_config():
    return {
        "embedding_mode": config.embedding_mode,
        "embedding_model": config.model_id,
        "ranker": ranker.info(),
        "openai_configured": bool(config.openai_api_key),
        "available_modes": ["local", "openai", "hash"],
        "info": {
            "local": "Real local embeddings (no API key). Recommended.",
            "openai": "OpenAI text-embedding-3-small (requires OPENAI_API_KEY).",
            "hash": "Non-semantic hash. Testing only — recall will be poor.",
        },
    }


@app.post("/config")
async def update_config(req: ConfigUpdateRequest):
    if req.embedding_mode not in ["local", "openai", "hash", "testing"]:
        raise HTTPException(status_code=400, detail="mode must be local | openai | hash")
    if req.embedding_mode == "openai" and not req.openai_api_key and not config.openai_api_key:
        raise HTTPException(status_code=400, detail="openai_api_key required for openai mode")
    try:
        actual = config.update_mode(req.embedding_mode, req.openai_api_key)
        if req.persist:
            config.save_to_env()
        return {
            "success": True,
            "embedding_mode": actual,
            "embedding_model": config.model_id,
            "persisted": req.persist,
            "message": f"Switched to {actual} ({config.model_id})",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/connectors")
async def list_connectors():
    """Which platforms are registered vs live. Live set is driven by config.json."""
    return {
        "registered": available(),
        "enabled": list(CONNECTORS),
        "detail": {name: c.health() for name, c in CONNECTORS.items()},
    }


@app.post("/ingest/{connector_name}")
async def ingest_route(connector_name: str, payload: dict):
    """
    Generic ingestion for ANY platform. The connector turns `payload` into
    normalized MemoryEvents; the core embeds + stores them (idempotently).
    One route serves every platform — adding a connector never adds an endpoint.
    """
    connector = CONNECTORS.get(connector_name)
    if not connector:
        raise HTTPException(
            status_code=404,
            detail=f"connector '{connector_name}' not enabled. enabled={list(CONNECTORS)}",
        )
    try:
        report = ingest(connector, payload, config.provider, store)
        return {"success": True, **report}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/store")
async def store_memory(req: StoreRequest):
    try:
        emb = config.provider.embed(req.text)
        memory_id = store.add_memory(
            text=req.text,
            embedding=emb.vector,
            source_app=req.source_app,
            tags=req.tags,
            url=req.url,
            conversation_id=req.conversation_id,
            message_type=req.message_type,
            embed_model=emb.model_id,
        )
        return {
            "success": True,
            "memory_id": memory_id,
            "embedding_model": emb.model_id,
            "message": "Memory stored",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/recall")
async def recall_memory(
    query: str = "",
    n_results: int = 10,
    limit: Optional[int] = None,   # alias: the extension sends `limit`
    source_app: Optional[str] = None,
):
    """Semantic search. Empty query returns most-recent memories."""
    try:
        top_k = limit if limit is not None else n_results

        if not query or not query.strip():
            memories = store.get_all_memories(limit=top_k)
            results = [
                {"id": m["id"], "content": m["text"], "score": 1.0, "metadata": m["metadata"]}
                for m in memories
            ]
            return {"success": True, "memories": results}

        results = search(query, top_k, source_app=source_app)
        formatted = [
            {
                "id": r["id"],
                "content": r["text"],
                "score": r.get("rank_score", r.get("score", 0.0)),
                "cosine": r.get("score", 0.0),
                "rank_components": r.get("rank_components"),
                "metadata": r["metadata"],
            }
            for r in results
        ]
        return {"success": True, "ranker": ranker.cfg.mode, "memories": formatted}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/memory/{memory_id}")
async def delete_memory(memory_id: str):
    if store.delete_memory(memory_id):
        return {"success": True, "message": "Memory deleted"}
    raise HTTPException(status_code=404, detail="Memory not found")


@app.get("/memories")
async def list_memories(limit: int = 100):
    return {"success": True, "memories": store.get_all_memories(limit=limit)}


@app.get("/stats")
async def stats():
    """Observability snapshot — the seed of your future Grafana dashboard."""
    return {"success": True, **store.stats(), "embedding_mode": config.embedding_mode}


@app.post("/evaluate")
async def evaluate(req: EvaluateRequest):
    """
    MLOps eval harness. Give it labeled probes (query -> the ids that *should*
    surface) and it reports precision@k and Mean Reciprocal Rank for the live
    embedding model. This is how you prove a retrieval change actually helped
    instead of guessing — the core skill of a forward-deployed engineer.
    """
    if not req.probes:
        raise HTTPException(status_code=400, detail="at least one probe required")

    k = req.k
    precisions, rr = [], []
    per_probe = []
    for p in req.probes:
        hits = search(p.query, k)  # same path as /recall: includes the ranker
        ranked_ids = [h["id"] for h in hits]
        relevant = set(p.relevant_ids)

        n_rel_in_k = sum(1 for i in ranked_ids if i in relevant)
        precision_at_k = n_rel_in_k / k if k else 0.0

        reciprocal = 0.0
        for rank, mid in enumerate(ranked_ids, start=1):
            if mid in relevant:
                reciprocal = 1.0 / rank
                break

        precisions.append(precision_at_k)
        rr.append(reciprocal)
        per_probe.append(
            {
                "query": p.query,
                "precision_at_k": round(precision_at_k, 3),
                "reciprocal_rank": round(reciprocal, 3),
                "returned_ids": ranked_ids,
            }
        )

    n = len(req.probes)
    return {
        "success": True,
        "embedding_model": config.model_id,
        "ranker": ranker.cfg.mode,
        "k": k,
        "mean_precision_at_k": round(sum(precisions) / n, 3),
        "mean_reciprocal_rank": round(sum(rr) / n, 3),
        "per_probe": per_probe,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=2789)
