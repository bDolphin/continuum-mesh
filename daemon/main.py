"""
FastAPI Memory Daemon
Location: daemon/main.py
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from memory_store import MemoryStore
import hashlib


app = FastAPI(title="Memory Daemon API")

# CORS for browser extension and local dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # wide open for local dev; lock down later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

store = MemoryStore()


class StoreRequest(BaseModel):
    text: str
    source_app: str
    tags: Optional[List[str]] = []
    url: Optional[str] = None
    conversation_id: Optional[str] = None
    message_type: Optional[str] = None


class RecallRequest(BaseModel):
    query: str
    n_results: int = 10
    source_app: Optional[str] = None
    tags: Optional[List[str]] = None


def get_embedding(text: str) -> List[float]:
    """
    TEMP: Local fake embedding so the daemon works without OpenAI quota.
    Uses SHA-256 hash of the text and turns the first 16 bytes into floats.
    """
    h = hashlib.sha256(text.encode("utf-8")).digest()
    return [b / 255.0 for b in h[:16]]


@app.get("/")
async def root():
    return {"status": "Memory Daemon is running"}


@app.post("/store")
async def store_memory(req: StoreRequest):
    """Store a new memory"""
    try:
        embedding = get_embedding(req.text)

        memory_id = store.add_memory(
            text=req.text,
            embedding=embedding,
            source_app=req.source_app,
            tags=req.tags,
            url=req.url,
            conversation_id=req.conversation_id,
            message_type=req.message_type,
        )

        return {
            "success": True,
            "memory_id": memory_id,
            "message": "Memory stored successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/recall")
async def recall_memory(
    query: str,
    n_results: int = 10,
    source_app: Optional[str] = None,
):
    """Semantic search for memories"""
    try:
        query_embedding = get_embedding(query)

        results = store.recall(
            query_embedding=query_embedding,
            n_results=n_results,
            source_app=source_app,
        )

        return {
            "success": True,
            "results": results,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/memory/{memory_id}")
async def delete_memory(memory_id: str):
    """Delete a memory"""
    success = store.delete_memory(memory_id)
    if success:
        return {"success": True, "message": "Memory deleted"}
    else:
        raise HTTPException(status_code=404, detail="Memory not found")


@app.get("/memories")
async def list_memories(limit: int = 100):
    """List all memories (for dashboard)"""
    memories = store.get_all_memories(limit=limit)
    return {"success": True, "memories": memories}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
