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
import os
from dotenv import load_dotenv, set_key, find_dotenv
from pathlib import Path

# Load environment variables
load_dotenv()

# Configuration state (mutable for runtime updates)
class Config:
    def __init__(self):
        self.embedding_mode = os.getenv("EMBEDDING_MODE", "testing").lower()
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")
        self.openai_client = None
        self._initialize_openai()
    
    def _initialize_openai(self):
        """Initialize OpenAI client if in openai mode"""
        if self.embedding_mode == "openai":
            try:
                from openai import OpenAI
                if not self.openai_api_key:
                    print("⚠️  WARNING: EMBEDDING_MODE is 'openai' but OPENAI_API_KEY is not set!")
                    print("   Falling back to testing mode.")
                    self.embedding_mode = "testing"
                else:
                    self.openai_client = OpenAI(api_key=self.openai_api_key)
                    print(f"✅ OpenAI embeddings enabled")
            except ImportError:
                print("⚠️  WARNING: openai package not installed. Falling back to testing mode.")
                self.embedding_mode = "testing"
            except Exception as e:
                print(f"⚠️  WARNING: Failed to initialize OpenAI: {e}")
                self.embedding_mode = "testing"
        
        if self.embedding_mode == "testing":
            print(f"🧪 Using testing mode (hash-based embeddings)")
    
    def update_mode(self, mode: str, api_key: Optional[str] = None):
        """Update embedding mode and optionally API key"""
        if api_key:
            self.openai_api_key = api_key
        self.embedding_mode = mode.lower()
        self._initialize_openai()
        return self.embedding_mode
    
    def save_to_env(self):
        """Persist configuration to .env file"""
        env_path = Path("daemon/.env")
        
        # Create .env if it doesn't exist
        if not env_path.exists():
            env_path.parent.mkdir(exist_ok=True)
            env_path.touch()
        
        # Update or set values
        set_key(str(env_path), "EMBEDDING_MODE", self.embedding_mode)
        if self.openai_api_key:
            set_key(str(env_path), "OPENAI_API_KEY", self.openai_api_key)

config = Config()


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


class ConfigUpdateRequest(BaseModel):
    embedding_mode: str
    openai_api_key: Optional[str] = None
    persist: bool = True


def get_testing_embedding(text: str) -> List[float]:
    """
    Testing mode: Local hash-based embedding (no API required).
    Uses SHA-256 hash of the text and turns the first 16 bytes into floats.
    """
    h = hashlib.sha256(text.encode("utf-8")).digest()
    return [b / 255.0 for b in h[:16]]


def get_openai_embedding(text: str) -> List[float]:
    """
    OpenAI mode: Uses OpenAI's text-embedding-3-small model.
    Requires OPENAI_API_KEY environment variable.
    """
    if not config.openai_client:
        raise HTTPException(status_code=500, detail="OpenAI client not initialized")
    
    try:
        response = config.openai_client.embeddings.create(
            model="text-embedding-3-small",
            input=text
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"❌ OpenAI embedding error: {e}")
        raise HTTPException(status_code=500, detail=f"OpenAI embedding failed: {str(e)}")


def get_embedding(text: str) -> List[float]:
    """
    Get embedding based on configured mode.
    Mode is set via EMBEDDING_MODE environment variable ('openai' or 'testing').
    """
    if config.embedding_mode == "openai":
        return get_openai_embedding(text)
    else:
        return get_testing_embedding(text)


@app.get("/")
async def root():
    return {
        "status": "Memory Daemon is running",
        "embedding_mode": config.embedding_mode,
        "openai_configured": bool(config.openai_api_key) if config.embedding_mode == "openai" else None
    }


@app.get("/config")
async def get_config():
    """Get current daemon configuration"""
    return {
        "embedding_mode": config.embedding_mode,
        "openai_configured": bool(config.openai_api_key),
        "available_modes": ["testing", "openai"],
        "info": {
            "testing": "Hash-based embeddings (no API key required)",
            "openai": "OpenAI text-embedding-3-small (requires OPENAI_API_KEY)"
        }
    }


@app.post("/config")
async def update_config(req: ConfigUpdateRequest):
    """Update daemon configuration (one-click integration)"""
    if req.embedding_mode not in ["testing", "openai"]:
        raise HTTPException(status_code=400, detail="Invalid embedding_mode. Must be 'testing' or 'openai'")
    
    if req.embedding_mode == "openai" and not req.openai_api_key:
        raise HTTPException(status_code=400, detail="openai_api_key required when switching to openai mode")
    
    try:
        # Update configuration
        actual_mode = config.update_mode(req.embedding_mode, req.openai_api_key)
        
        # Persist to .env file if requested
        if req.persist:
            config.save_to_env()
        
        return {
            "success": True,
            "embedding_mode": actual_mode,
            "openai_configured": bool(config.openai_api_key),
            "persisted": req.persist,
            "message": f"Successfully switched to {actual_mode} mode"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Configuration update failed: {str(e)}")


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
    query: str = "",
    n_results: int = 10,
    source_app: Optional[str] = None,
):
    """Semantic search for memories. Empty query returns all memories."""
    try:
        # If query is empty, return all memories
        if not query or query.strip() == "":
            memories = store.get_all_memories(limit=n_results)
            # Convert to same format as recall results
            results = [
                {
                    "id": m["id"],
                    "content": m["text"],
                    "score": 1.0,
                    "metadata": m["metadata"]
                }
                for m in memories
            ]
            return {
                "success": True,
                "results": results,
            }
        
        query_embedding = get_embedding(query)

        results = store.recall(
            query_embedding=query_embedding,
            n_results=n_results,
            source_app=source_app,
        )
        
        # Convert to frontend format
        formatted_results = [
            {
                "id": r["id"],
                "content": r["text"],
                "score": 1.0 - r["distance"] if r["distance"] is not None else 0.0,
                "metadata": r["metadata"]
            }
            for r in results
        ]

        return {
            "success": True,
            "results": formatted_results,
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

    uvicorn.run(app, host="0.0.0.0", port=2789)
