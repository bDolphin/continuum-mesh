from typing import List, Optional
from fastapi import FastAPI, Query
from pydantic import BaseModel
import time

app = FastAPI(title="Context Memory Mesh Daemon", version="0.1.0")


# ----- Models -----

class StoreMetadata(BaseModel):
    url: Optional[str] = None
    project: Optional[str] = None
    tags: Optional[List[str]] = None


class StoreRequest(BaseModel):
    content: str
    source: str
    metadata: Optional[StoreMetadata] = None


class StoreResponse(BaseModel):
    id: str
    status: str = "stored"


class RecallResult(BaseModel):
    id: str
    content: str
    score: float
    metadata: dict


class RecallResponse(BaseModel):
    results: List[RecallResult]


# ----- Health -----

@app.get("/health")
def health():
    return {"status": "ok", "time": time.time()}


# ----- Store Memory (stub) -----

@app.post("/store", response_model=StoreResponse)
def store_memory(body: StoreRequest):
    # TODO: hook into embedding + vector store
    fake_id = f"mem_{int(time.time())}"
    return StoreResponse(id=fake_id, status="stored")


# ----- Recall Memory (stub) -----

@app.get("/recall", response_model=RecallResponse)
def recall_memory(
    query: str = Query(...),
    limit: int = Query(5, ge=1, le=50),
    sources: Optional[str] = Query(None),
):
    # TODO: run semantic + hybrid search against vector store
    return RecallResponse(results=[])
