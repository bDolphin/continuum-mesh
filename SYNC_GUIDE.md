# 🔄 Cross-Tool Memory Sync Guide

## How It Works

Context Memory Mesh enables seamless memory sync across all AI tools through a unified backend. When you capture research in **Perplexity** or code discussions in **ChatGPT**, they're all stored in the same memory pool and instantly accessible everywhere.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│         Chrome Extension (Manifest v3)              │
│  ┌────────────┬──────────────┬──────────────┐      │
│  │  ChatGPT   │  Perplexity  │   Generic    │      │
│  │ Content    │   Content    │   Content    │      │
│  │  Script    │   Script     │   Script     │      │
│  └──────┬─────┴──────┬───────┴──────┬───────┘      │
│         │            │              │               │
│  ┌──────v────────────v──────────────v────┐         │
│  │   Shared Service Worker (bg.js)       │         │
│  │   - Message routing                   │         │
│  │   - API communication                 │         │
│  └────────┬─────────────────────────────┘          │
└───────────┼──────────────────────────────────────────┘
            │
            ↓ HTTP
    ┌───────────────────┐
    │  Daemon API       │
    │  :2789            │
    │  ┌─────────────┐  │
    │  │ MemoryStore │  │
    │  │ (in-memory) │  │
    │  └─────────────┘  │
    └───────────────────┘
```

---

## Data Flow: Store → Sync → Recall

### 1️⃣ Store from Perplexity

**User Action**: Click "Store Research" on Perplexity.ai

**Perplexity Content Script** (`extension/content/perplexity.js`):
```javascript
// Extract research findings, citations, sources
const memoryData = {
  text: findings,
  source_app: 'perplexity',
  context_type: 'research',
  tags: [...],
  metadata: { research_type: 'perplexity_answer', ... }
};

// Send to background service worker
chrome.runtime.sendMessage({
  type: 'STORE_MEMORY',
  data: memoryData
});
```

**Service Worker** (`extension/background.js`):
```javascript
if (message.type === 'STORE_MEMORY') {
  storeMemory(message.data)
    .then(response => {
      // Cache for quick recall
      StorageManager.saveLastMemories(memories);
      sendResponse({ success: true });
    });
}
```

**Backend** (`daemon/main.py`):
```python
@app.post("/store")
async def store_memory(request: StoreRequest):
    embedding = get_embedding(request.text)
    memory_id = store.add_memory(
        text=request.text,
        embedding=embedding,
        source_app=request.source_app,  # "perplexity"
        tags=request.tags,
        ...
    )
    return {"success": True, "memory_id": memory_id}
```

**Memory Store** (`daemon/memory_store.py`):
```python
# Stored in in-memory dictionary with embedding vector
self.memories[memory_id] = {
    "id": memory_id,
    "text": text,
    "embedding": embedding,  # OpenAI/testing mode
    "metadata": {
        "source_app": "perplexity",
        "timestamp": "2025-12-14T...",
        "tags": "research,rag,llm"
    }
}
```

---

### 2️⃣ Recall in ChatGPT

**User Action**: Use hotkey `Ctrl+Shift+R` on ChatGPT.com

**ChatGPT Content Script** (`extension/content/chatgpt.js`):
```javascript
// User selected search query
const query = "RAG architecture";

chrome.runtime.sendMessage({
  type: 'RECALL_MEMORIES',
  data: {
    text: query,
    limit: 10
  }
});
```

**Service Worker** (`extension/background.js`):
```javascript
if (message.type === 'RECALL_MEMORIES') {
  recallMemories(message.data)
    .then(response => {
      // Returns ranked memories from backend
      sendResponse({ success: true, data: response });
    });
}
```

**Backend** (`daemon/main.py`):
```python
@app.get("/recall")
async def recall_memory(query: str, n_results: int = 10):
    query_embedding = get_embedding(query)
    results = store.recall(
        query_embedding=query_embedding,
        n_results=n_results
    )
    # Rank by semantic similarity
    return {
        "success": True,
        "memories": [
            {
                "id": m["id"],
                "content": m["text"],
                "score": similarity_score,
                "metadata": m["metadata"]
            }
            for m in results
        ]
    }
```

**Memory Store** (`daemon/memory_store.py`):
```python
def recall(self, query_embedding, n_results=10):
    results = []
    
    for memory_id, memory in self.memories.items():
        # Calculate cosine similarity
        similarity = self._cosine_similarity(
            query_embedding,
            memory["embedding"]
        )
        
        results.append({
            "id": memory_id,
            "text": memory["text"],
            "score": similarity,
            "metadata": memory["metadata"]
        })
    
    # Sort by similarity (highest first)
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:n_results]
```

---

### 3️⃣ Display in ChatGPT UI

**ChatGPT Content Script** displays recalled memories:
```javascript
// Response from service worker
const memories = response.data.memories;

// Show memory panel with ranked results
memories.forEach(mem => {
  const element = document.createElement('div');
  element.innerHTML = `
    <div class="memory-item">
      <strong>${mem.metadata.source_app}</strong>
      <p>${mem.content.substring(0, 100)}...</p>
      <small>Score: ${(mem.score * 100).toFixed(0)}%</small>
    </div>
  `;
  memoryPanel.appendChild(element);
});
```

---

## Key Features

### ✅ Unified Data Pool
- All memories stored in single daemon
- Source tracked (`source_app: "perplexity"` or `"chatgpt"`)
- Cross-tool visibility

### ✅ Semantic Ranking
- Memories ranked by embedding similarity (not keyword match)
- Query: "vector database" → Finds "RAG with embeddings" (score: 0.865)

### ✅ Fast Recall
- Cosine similarity computation: O(n) where n = total memories
- Sub-150ms response typical

### ✅ Safe Messaging
- Content scripts can't access service worker directly
- All communication via `chrome.runtime.sendMessage()`
- Extension context validation with `chrome.runtime.lastError`

---

## Sync Scenarios

### Scenario 1: Research → Code
```
1. Perplexity: Store "RAG with vector embeddings"
   ↓ (Backend: store with embedding)
   
2. ChatGPT: Ask "How to implement RAG?"
   ↓ (recall hotkey: Ctrl+Shift+R)
   
3. ChatGPT: Recalls Perplexity research
   → "Implement RAG with vector embeddings (from your research)"
```

### Scenario 2: Code Discussion → Documentation
```
1. ChatGPT: Store "FastAPI service with CORS enabled"
   ↓ (Backend: store with embedding)
   
2. Later in Perplexity: Search "API middleware"
   ↓ (recall: searches backend)
   
3. Perplexity: Shows "FastAPI CORS configuration (from ChatGPT)"
```

### Scenario 3: Generic Web → All Tools
```
1. Generic content script: Store selected text from any website
   ↓ (Backend: store with context_type="web")
   
2. ChatGPT, Perplexity, Cursor: All can recall generic memories
   ↓ (recall: no source_app filter by default)
   
3. All tools see shared knowledge pool
```

---

## Configuration

### Environment Variables (`.env`)

```bash
# Backend embedding mode
EMBEDDING_MODE=testing  # or "openai" for real embeddings
OPENAI_API_KEY=sk-...   # Required if EMBEDDING_MODE=openai
```

### Manifest Configuration (`extension/manifest.json`)

```json
{
  "content_scripts": [
    {
      "matches": ["https://chatgpt.com/*"],
      "js": ["utils/detector.js", "utils/storage.js", "utils/api.js", "content/chatgpt.js"]
    },
    {
      "matches": ["https://www.perplexity.ai/*"],
      "js": ["utils/detector.js", "utils/storage.js", "utils/api.js", "content/perplexity.js"]
    },
    {
      "matches": ["<all_urls>"],
      "js": ["utils/detector.js", "utils/storage.js", "content/content-script.js"]
    }
  ]
}
```

**Key**: Utilities loaded BEFORE content scripts to ensure global scope is populated.

---

## Testing the Sync

### Test 1: Store from Both Tools
```bash
# Terminal 1: Start daemon
cd daemon && source .venv/bin/activate
uvicorn main:app --reload --port 2789

# Terminal 2: Store memories
curl -X POST http://localhost:2789/store \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Vector databases enable semantic search",
    "source_app": "perplexity",
    "tags": ["vectors", "db"]
  }'

curl -X POST http://localhost:2789/store \
  -H "Content-Type: application/json" \
  -d '{
    "text": "RAG combines retrieval and generation",
    "source_app": "chatgpt",
    "tags": ["rag", "llm"]
  }'
```

### Test 2: Recall with Cross-Source Results
```bash
curl "http://localhost:2789/recall?query=vector+semantic+search&limit=5"

# Expected output (both memories should appear):
{
  "success": true,
  "memories": [
    {
      "id": "...",
      "content": "Vector databases enable semantic search",
      "score": 0.92,
      "metadata": {"source_app": "perplexity", ...}
    },
    {
      "id": "...",
      "content": "RAG combines retrieval and generation",
      "score": 0.78,
      "metadata": {"source_app": "chatgpt", ...}
    }
  ]
}
```

### Test 3: Extension UI Sync
1. Open chrome://extensions
2. Load unpacked: select `extension/` folder
3. Go to **ChatGPT.com** → Click extension icon → Store some text (Ctrl+Shift+M)
4. Go to **Perplexity.ai** → Click extension icon → Recall (Ctrl+Shift+R)
5. Should see ChatGPT memory in Perplexity sidebar

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Failed to store" | Daemon not running | Start daemon: `uvicorn main:app --reload --port 2789` |
| Recall returns no results | No embeddings match | Check query syntax, verify memories stored |
| Extension won't load | Manifest syntax error | Run: `python3 -c "import json; json.load(open('extension/manifest.json'))"` |
| Memory not synced | Different source_app filter | Check recall endpoint: no filter by default |
| Hotkey not working | Content script not loaded | Check `chrome://extensions` for errors |

---

## Next Steps

- [ ] Add ChatGPT Actions for memory-aware conversations
- [ ] Implement memory export/import (JSON)
- [ ] Add timestamp-based filters (last 7 days, etc.)
- [ ] Add project/workspace tags for organization
- [ ] Build VSCode extension for IDE-native access
- [ ] Implement cloud sync (optional)

---

**Last Updated**: December 14, 2025  
**Version**: 0.2.0 (Cross-Tool Sync)
