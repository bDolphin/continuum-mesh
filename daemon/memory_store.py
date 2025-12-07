"""
ChromaDB Memory Store
Location: daemon/memory_store.py
"""
from chromadb import Client, Settings
import chromadb
from datetime import datetime
from typing import List, Dict, Optional
import uuid

class MemoryStore:
    def __init__(self, persist_directory: str = "./chroma_db"):
        self.client = chromadb.PersistentClient(path=persist_directory)
        
        # Create or get collection
        self.collection = self.client.get_or_create_collection(
            name="memory_store",
            metadata={"hnsw:space": "cosine"}
        )
    
    def add_memory(
        self,
        text: str,
        embedding: List[float],
        source_app: str,
        tags: List[str] = None,
        url: Optional[str] = None,
        conversation_id: Optional[str] = None,
        message_type: Optional[str] = None
    ) -> str:
        """Store a memory chunk with metadata"""
        
        memory_id = str(uuid.uuid4())
        timestamp = datetime.utcnow().isoformat()
        
        metadata = {
            "source_app": source_app,
            "timestamp": timestamp,
            "tags": ",".join(tags) if tags else "",
        }
        
        if url:
            metadata["url"] = url
        if conversation_id:
            metadata["conversation_id"] = conversation_id
        if message_type:
            metadata["message_type"] = message_type
        
        self.collection.add(
            ids=[memory_id],
            embeddings=[embedding],
            documents=[text],
            metadatas=[metadata]
        )
        
        return memory_id
    
    def recall(
        self,
        query_embedding: List[float],
        n_results: int = 10,
        source_app: Optional[str] = None,
        tags: Optional[List[str]] = None
    ) -> List[Dict]:
        """Semantic search for memories"""
        
        where_filter = {}
        
        if source_app:
            where_filter["source_app"] = source_app
        
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            where=where_filter if where_filter else None
        )
        
        memories = []
        for i in range(len(results['ids'][0])):
            memories.append({
                "id": results['ids'][0][i],
                "text": results['documents'][0][i],
                "metadata": results['metadatas'][0][i],
                "distance": results['distances'][0][i] if 'distances' in results else None
            })
        
        return memories
    
    def delete_memory(self, memory_id: str) -> bool:
        """Delete a specific memory"""
        try:
            self.collection.delete(ids=[memory_id])
            return True
        except Exception as e:
            print(f"Error deleting memory: {e}")
            return False
    
    def get_all_memories(self, limit: int = 100) -> List[Dict]:
        """Get all memories (for dashboard)"""
        results = self.collection.get(limit=limit)
        
        memories = []
        for i in range(len(results['ids'])):
            memories.append({
                "id": results['ids'][i],
                "text": results['documents'][i],
                "metadata": results['metadatas'][i]
            })
        
        return memories