"""
ChromaDB Memory Store
Location: daemon/memory_store.py

Note: chromadb is currently disabled due to Python 3.14 compatibility issues.
This is a placeholder implementation that can be replaced with a real vector store.
"""
from datetime import datetime
from typing import List, Dict, Optional
import uuid

class MemoryStore:
    def __init__(self, persist_directory: str = "./chroma_db"):
        # TODO: Integrate with a real vector store (chromadb, pinecone, weaviate, etc.)
        # For now, store in memory
        self.persist_directory = persist_directory
        self.memories: Dict[str, Dict] = {}
    
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
        
        self.memories[memory_id] = {
            "id": memory_id,
            "text": text,
            "embedding": embedding,
            "metadata": metadata
        }
        
        return memory_id
    
    def recall(
        self,
        query_embedding: List[float],
        n_results: int = 10,
        source_app: Optional[str] = None,
        tags: Optional[List[str]] = None
    ) -> List[Dict]:
        """Semantic search for memories using embedding similarity"""
        
        results = []
        
        for memory_id, memory in self.memories.items():
            metadata = memory.get("metadata", {})
            
            # Filter by source_app if provided
            if source_app and metadata.get("source_app") != source_app:
                continue
            
            # Calculate cosine similarity between embeddings
            embedding = memory.get("embedding", [])
            similarity_score = self._cosine_similarity(query_embedding, embedding)
            
            results.append({
                "id": memory_id,
                "text": memory["text"],
                "metadata": metadata,
                "distance": 1.0 - similarity_score  # Convert similarity to distance
            })
        
        # Sort by distance (closest first) and return top n_results
        results.sort(key=lambda x: x["distance"])
        return results[:n_results]
    
    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        if not vec1 or not vec2 or len(vec1) == 0 or len(vec2) == 0:
            return 0.0
        
        # Handle different vector lengths by padding with zeros
        max_len = max(len(vec1), len(vec2))
        v1 = vec1 + [0.0] * (max_len - len(vec1))
        v2 = vec2 + [0.0] * (max_len - len(vec2))
        
        # Calculate dot product
        dot_product = sum(a * b for a, b in zip(v1, v2))
        
        # Calculate magnitudes
        magnitude_v1 = sum(a * a for a in v1) ** 0.5
        magnitude_v2 = sum(b * b for b in v2) ** 0.5
        
        # Avoid division by zero
        if magnitude_v1 == 0 or magnitude_v2 == 0:
            return 0.0
        
        return dot_product / (magnitude_v1 * magnitude_v2)
    
    def delete_memory(self, memory_id: str) -> bool:
        """Delete a specific memory"""
        try:
            if memory_id in self.memories:
                del self.memories[memory_id]
            return True
        except Exception as e:
            print(f"Error deleting memory: {e}")
            return False
    
    def get_all_memories(self, limit: int = 100) -> List[Dict]:
        """Get all memories (for dashboard), sorted by timestamp descending"""
        memories = []
        for memory_id, memory in self.memories.items():
            memories.append({
                "id": memory_id,
                "text": memory["text"],
                "metadata": memory["metadata"]
            })
        
        # Sort by timestamp (most recent first)
        memories.sort(key=lambda m: m['metadata'].get('timestamp', '1970-01-01T00:00:00'), reverse=True)
        
        # Return only the requested limit
        return memories[:limit]
        return memories[:limit]