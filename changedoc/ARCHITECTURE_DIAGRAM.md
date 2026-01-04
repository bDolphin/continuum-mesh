# 🔄 Cross-Tool Sync Architecture Diagram

## Message Flow: Store → Backend → Recall

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         BROWSER (Chrome Extension)                           │
│                                                                              │
│  ┌────────────────────────┐   ┌────────────────────────┐   ┌──────────────┐ │
│  │   ChatGPT Content      │   │  Perplexity Content    │   │  Generic Web │ │
│  │    Script              │   │    Script              │   │   Script     │ │
│  │                        │   │                        │   │              │ │
│  │ 1. User selects text   │   │ 1. User clicks "Store" │   │ 1. User      │ │
│  │ 2. Hotkey Ctrl+Shift+M │   │    research button     │   │    selects   │ │
│  │ 3. Extract tags        │   │ 2. Extract findings    │   │    text      │ │
│  │ 4. Build memoryData    │   │    + citations         │   │ 2. Hotkey    │ │
│  └────────────────────────┘   │ 3. Build memoryData    │   └──────────────┘ │
│           │                    │ 4. Build memoryData    │          │          │
│           │                    │ 5. Build memoryData    │          │          │
│           └────────────────┬───┴──────────┬─────────────┴──────────┘          │
│                            │              │                                  │
│                      ALL USE:                                                │
│              chrome.runtime.sendMessage({                                     │
│                type: 'STORE_MEMORY',                                         │
│                data: memoryData  ←──── Common format                        │
│              })                                                               │
│                            │              │                                  │
│                            └──────┬───────┘                                  │
│                                   ↓                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │            Service Worker (background.js)                           │   │
│  │                                                                      │   │
│  │  chrome.runtime.onMessage.addListener((message, sender) => {        │   │
│  │    if (message.type === 'STORE_MEMORY') {                          │   │
│  │      storeMemory(message.data)  ←─── Route to API                 │   │
│  │        .then(response => sendResponse({ success: true }))          │   │
│  │    }                                                                │   │
│  │  })                                                                │   │
│  └─────────────────────┬──────────────────────────────────────────────┘   │
│                        │                                                    │
└────────────────────────┼────────────────────────────────────────────────────┘
                         │ HTTP POST
                         ↓
                ┌──────────────────────┐
                │   Daemon API         │
                │   :2789              │
                │                      │
                │  /store              │
                │  /recall             │
                │  /config             │
                └──────────┬───────────┘
                           │
                ┌──────────v──────────┐
                │  MemoryStore        │
                │  (in-memory dict)   │
                │                     │
                │  memories = {       │
                │    "id-1": {        │
                │      text: "...",    │
                │      embedding: [...│
                │      metadata: {...} │
                │    },               │
                │    "id-2": { ... }  │
                │  }                  │
                └─────────────────────┘
```

---

## Data Structure Flow

### STORE: Content Script → Service Worker → Backend

```javascript
// Content Script (perplexity.js)
const memoryData = {
  text: "Vector databases enable semantic search",
  source_app: "perplexity",           // ← Track source
  context_type: "research",
  url: "https://perplexity.ai/...",
  tags: ["vectors", "db", "rag"],
  metadata: {
    research_type: "perplexity_answer",
    source_count: 12,
    citation_count: 8
  }
};

// ↓ chrome.runtime.sendMessage
// ↓ Service Worker receives and extracts memoryData
// ↓ Service Worker calls fetch() to backend

// Backend (main.py)
class StoreRequest(BaseModel):
    text: str
    source_app: str           # ← Preserved
    tags: Optional[List[str]]
    url: Optional[str]

# ↓ Backend extracts embedding via OpenAI/testing mode
# ↓ Backend stores in MemoryStore

# MemoryStore (memory_store.py)
{
  "318597ea-...": {
    "id": "318597ea-...",
    "text": "Vector databases enable semantic search",
    "embedding": [0.12, -0.34, 0.56, ...],  # ← 1536 dimensions
    "metadata": {
      "source_app": "perplexity",           # ← Tracked
      "timestamp": "2025-12-14T10:23:45",
      "tags": "vectors,db,rag",
      "url": "https://perplexity.ai/..."
    }
  }
}
```

---

## RECALL: Request → Semantic Ranking → Response

```
┌─────────────────────────────────────────────────────────────────────┐
│ User on ChatGPT: Presses Ctrl+Shift+R or searches memories         │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ↓
    chrome.runtime.sendMessage({
      type: 'RECALL_MEMORIES',
      data: {
        text: "vector database search",    ← Query
        limit: 5
      }
    })
                         │
                         ↓
          ┌──────────────────────────────┐
          │   Service Worker             │
          │   Receives message           │
          │   Calls: /recall?query=...   │
          └──────────────┬───────────────┘
                         │ HTTP GET
                         ↓
         ┌──────────────────────────────────┐
         │ Backend (main.py)                │
         │ async def recall_memory()        │
         │                                  │
         │ 1. Get embedding of query       │
         │    query_embedding = [...]      │
         │                                  │
         │ 2. Call store.recall()          │
         │    results = store.recall(      │
         │      query_embedding,           │
         │      n_results=5                │
         │    )                            │
         └──────────────┬──────────────────┘
                        │
         ┌──────────────v──────────────────┐
         │ MemoryStore.recall()            │
         │                                 │
         │ for memory_id, memory in ....:  │
         │   embedding = memory.embedding  │
         │   similarity = cosine_sim(      │
         │     query_embedding,            │
         │     embedding                   │
         │   )                             │
         │   results.append({              │
         │     id, text, metadata,         │
         │     distance: 1.0 - similarity  │
         │   })                            │
         │                                 │
         │ Sort by distance (closest first)│
         │ Return top 5                    │
         └──────────────┬──────────────────┘
                        │
        ┌───────────────v────────────────┐
        │ Results (ranked by similarity) │
        │                                │
        │ [                              │
        │   {                            │
        │     id: "90ac8331-...",       │
        │     content: "RAG combines...", │
        │     score: 0.88,      ← Top!   │
        │     metadata: {                │
        │       source_app: "perplexity", │
        │       tags: "rag,llm"           │
        │     }                          │
        │   },                           │
        │   {                            │
        │     id: "318597ea-...",       │
        │     content: "Vector db...",   │
        │     score: 0.72,               │
        │     metadata: {                │
        │       source_app: "perplexity", │
        │       tags: "vectors,db"        │
        │     }                          │
        │   }                            │
        │ ]                              │
        └───────────────┬────────────────┘
                        │ HTTP 200
                        ↓
         ┌──────────────────────────────┐
         │   Service Worker             │
         │   Gets response               │
         │   Calls sendResponse()        │
         └──────────────┬───────────────┘
                        │
                        ↓
    ┌────────────────────────────────────────┐
    │   ChatGPT Content Script              │
    │   Receives in callback()              │
    │                                       │
    │   memories = response.data.memories   │
    │                                       │
    │   Display in sidebar:                 │
    │   ┌──────────────────────────────┐   │
    │   │ 🧠 Related Memories          │   │
    │   │ ─────────────────────────────│   │
    │   │ RAG combines... (0.88)        │   │
    │   │ [from perplexity]            │   │
    │   │                              │   │
    │   │ Vector db... (0.72)          │   │
    │   │ [from perplexity]            │   │
    │   └──────────────────────────────┘   │
    └────────────────────────────────────────┘
                        │
                        ↓
        User sees ChatGPT and Perplexity memories unified!
```

---

## Semantic Similarity Scoring (Cosine Similarity)

```
Query: "vector database search"
Query Embedding: [0.1, 0.8, 0.2, ...]

Memory 1: "Vector databases enable semantic search"
Embedding 1: [0.12, 0.79, 0.21, ...]
Similarity: 0.95 ← Very similar!

Memory 2: "RAG combines retrieval and generation"
Embedding 2: [0.3, 0.6, 0.1, ...]
Similarity: 0.72 ← Somewhat similar

Memory 3: "CSS styling best practices"
Embedding 3: [-0.5, 0.1, -0.2, ...]
Similarity: 0.15 ← Not similar

Results sorted by similarity:
1. Memory 1 (0.95) ← Top result
2. Memory 2 (0.72)
3. Memory 3 (0.15)
```

---

## Unified Data Format (All Sources)

```
┌────────────────────────────────────────────────────────────┐
│             Memory Object (Universal Format)              │
└────────────────────────────────────────────────────────────┘

{
  "id": "358597ea-f993-4101-bd1c-7358caad980a",

  "text": "Full memory content here...",

  "embedding": [0.12, -0.34, 0.56, ...],  ← 1536 values
                                             (OpenAI or test)

  "metadata": {
    "source_app": "perplexity" | "chatgpt" | "chrome",
                  ↑ Track where it came from

    "timestamp": "2025-12-14T10:23:45Z",
                 ↑ When it was stored

    "tags": "rag,llm,research",
            ↑ User or auto-extracted tags

    "url": "https://perplexity.ai/...",
           ↑ Source URL

    // Optional fields depending on source_app:
    "research_type": "perplexity_answer",     // from perplexity
    "source_count": 12,                       // from perplexity
    "citation_count": 8,                      // from perplexity
  }
}

╔════════════════════════════════════════════════════════════╗
║ Key Point: Same format for ALL sources                   ║
║ This enables true cross-tool sync!                       ║
╚════════════════════════════════════════════════════════════╝
```

---

## Source Filtering (Optional)

```
GET /recall?query=vector&source_app=perplexity&limit=5

Only returns memories WHERE source_app = "perplexity"

GET /recall?query=vector&limit=5

Returns memories from ALL sources, ranked by similarity

GET /recall?query=&limit=100

Returns all memories (empty query = no semantic filter)
```

---

## Extension Loading Order (Manifest)

```
                    manifest.json
                         │
        ┌────────────────┼────────────────┐
        ↓                ↓                ↓
    ChatGPT          Perplexity       Generic Web
  matches: [...]   matches: [...]   matches: ["<all_urls>"]
        │                ↓                │
        │         Load in order:         │
        │         ━━━━━━━━━━━━━━        │
        ├────→ 1. detector.js           │
        ├────→ 2. storage.js    ←───────┤
        ├────→ 3. api.js        ←───────┤
        └────→ 4. chatgpt.js            │
               5. perplexity.js ←───────┤
               6. content-script.js  ←──┘

╔════════════════════════════════════════════════════════════╗
║ CRITICAL: Utilities MUST load BEFORE content scripts     ║
║ Otherwise: window.ContextDetector undefined              ║
║                                                          ║
║ ✓ Correct:   [utils before content]                    ║
║ ✗ Wrong:    [content before utils]                     ║
╚════════════════════════════════════════════════════════════╝
```

---

## Error Handling Flow

```
                    Error Occurs
                         │
        ┌────────────────┴─────────────────┐
        ↓                                   ↓
   In Content Script              In Service Worker
        │                                   │
        ├─→ chrome.runtime.sendMessage()   │
        │   └─→ Is extension context       │
        │       still valid?               │
        │       ├─ YES: Proceed           │
        │       └─ NO: chrome.runtime     │
        │              .lastError         │
        │              Show warning:      │
        │              "Extension         │
        │               reloaded..."      │
        │                                  │
        └──────────────────┬───────────────┘
                           │
                    Can't reach API?
                           │
        ┌──────────────────┴──────────────────┐
        ↓                                      ↓
   Retry with timeout              Show user error:
   (max 3 times)                  "Daemon not running"
        │                              │
        └─→ If all fail:      Guide: Start daemon on :2789
            Show error UI
```

---

## Performance Characteristics

```
┌──────────────────────────────────────────┐
│         Operation                Performance│
├──────────────────────────────────────────┤
│ Store to daemon                  <50ms   │
│ (API call only)                          │
│                                          │
│ Recall (100 memories)            <100ms  │
│ (cosine similarity O(n))                 │
│                                          │
│ Semantic ranking                 <50ms   │
│ (sort O(n log n))                       │
│                                          │
│ Total round trip                 ~150ms  │
│ (user-perceivable)                      │
└──────────────────────────────────────────┘
```

---

**Diagram Version**: 0.2.0  
**Last Updated**: December 14, 2025
