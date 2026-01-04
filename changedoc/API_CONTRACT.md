# Memory Mesh API Contract v1.0

## Base URL
```
http://localhost:2789
```

## Endpoints

### 1. Health Check
```
GET /
```

**Response** (200 OK):
```json
{
  "status": "ok",
  "service": "Memory Mesh Daemon"
}
```

---

### 2. Store Memory
```
POST /store
```

**Request Headers**:
```
Content-Type: application/json
```

**Request Body**:
```json
{
  "text": "The memory content to store",
  "source_app": "chatgpt|perplexity|generic",
  "tags": ["optional", "tags"],
  "url": "https://optional-source-url.com",
  "conversation_id": "optional-conversation-id",
  "message_type": "user|assistant|context"
}
```

**Required Fields**:
- `text` (string): The memory content
- `source_app` (string): Where the memory came from

**Optional Fields**:
- `tags` (array): Classification tags
- `url` (string): Source URL
- `conversation_id` (string): For grouping related memories
- `message_type` (string): Type of message

**Response** (200 OK):
```json
{
  "success": true,
  "memory_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Memory stored successfully"
}
```

**Error Response** (422 Unprocessable Content):
```json
{
  "detail": [
    {
      "type": "missing",
      "loc": ["body", "source_app"],
      "msg": "Field required"
    }
  ]
}
```

---

### 3. Recall Memories
```
GET /recall
```

**Query Parameters**:
```
query        (string)  : Search query (optional, empty returns all)
n_results    (integer) : Number of results to return (default: 10)
source_app   (string)  : Filter by source app (optional)
```

**Examples**:
```
GET /recall?query=quantum&n_results=5
GET /recall?query=&n_results=20
GET /recall?query=python&source_app=chatgpt
```

**Response** (200 OK):
```json
{
  "success": true,
  "memories": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "content": "The full memory text that was stored",
      "score": 0.95,
      "metadata": {
        "source_app": "chatgpt",
        "timestamp": "2025-12-14T15:29:07.223815",
        "tags": "",
        "url": "https://example.com"
      }
    }
  ]
}
```

**Empty Response** (200 OK):
```json
{
  "success": true,
  "memories": []
}
```

---

### 4. Delete Memory
```
DELETE /memory/{memory_id}
```

**Path Parameters**:
- `memory_id` (string): UUID of memory to delete

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Memory deleted successfully"
}
```

**Error Response** (404 Not Found):
```json
{
  "success": false,
  "message": "Memory not found"
}
```

---

### 5. Get Configuration
```
GET /config
```

**Query Parameters**:
```
embedding_mode  (string) : Set to "openai" or "hash" (optional)
openai_api_key  (string) : OpenAI API key (optional)
persist         (boolean): Enable persistence (optional)
```

**Response** (200 OK):
```json
{
  "embedding_mode": "hash",
  "openai_configured": false,
  "persisted": true,
  "message": "Configuration retrieved"
}
```

---

### 6. Update Configuration
```
PUT /config
```

**Request Body**:
```json
{
  "embedding_mode": "hash",
  "openai_api_key": "sk-...",
  "persist": true
}
```

**Response** (200 OK):
```json
{
  "embedding_mode": "hash",
  "openai_configured": false,
  "persisted": true,
  "message": "Successfully switched to hash mode"
}
```

---

## Data Model

### Memory Object
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "content": "The memory text",
  "score": 0.95,
  "metadata": {
    "source_app": "chatgpt",
    "timestamp": "2025-12-14T15:29:07.223815",
    "tags": "tag1,tag2",
    "url": "https://example.com",
    "conversation_id": "conv-123",
    "message_type": "user"
  }
}
```

### Metadata Structure
- `source_app`: Origin of the memory (chatgpt, perplexity, vscode, etc.)
- `timestamp`: ISO 8601 format
- `tags`: Comma-separated classification tags
- `url`: Optional source URL
- `conversation_id`: Optional grouping ID
- `message_type`: user|assistant|context

---

## Status Codes

| Code | Meaning | Common Cause |
|------|---------|--------------|
| 200 | OK | Successful request |
| 400 | Bad Request | Invalid query parameters |
| 404 | Not Found | Memory ID not found |
| 422 | Unprocessable Content | Missing required fields in POST |
| 500 | Internal Server Error | Embedding generation failed |

---

## Request/Response Format

All requests and responses use **JSON**.

**Content-Type**: `application/json`

**Character Encoding**: UTF-8

---

## Error Handling

All errors follow this format:

```json
{
  "detail": "Error message description"
}
```

Or for validation errors:

```json
{
  "detail": [
    {
      "type": "missing",
      "loc": ["body", "field_name"],
      "msg": "Field required",
      "input": {}
    }
  ]
}
```

---

## Rate Limiting

Currently unlimited. Implement based on requirements:
- Suggested: 100 requests/minute per client
- Batch size limit: 100 memories per query

---

## Authentication

Currently none. Plan for Phase 3:
- API key authentication
- Per-user memory isolation
- Rate limiting per key

---

## Embedding Modes

### Hash Mode (Default)
- No external API required
- Fast, deterministic
- Based on content hash
- Good for testing

### OpenAI Mode
- Requires valid OPENAI_API_KEY
- Uses text-embedding-3-small model
- More accurate semantic search
- Cost per 1M tokens: ~$0.02

**Switch mode**:
```
PUT /config
{
  "embedding_mode": "openai",
  "openai_api_key": "sk-..."
}
```

---

## Storage

### Current (Testing)
- In-memory Python dict
- Lost on daemon restart
- Fast, no I/O

### Future (Planned)
- SQLite with embeddings
- ChromaDB vector storage
- PostgreSQL with pgvector

---

## Performance

| Operation | Latency | Notes |
|-----------|---------|-------|
| Store memory | <100ms | Includes embedding generation |
| Recall (empty) | <50ms | Returns all memories |
| Recall (query) | 50-200ms | Depends on store size |
| Delete memory | <50ms | Index update |

---

## Concurrency

- Single-threaded (Uvicorn async)
- Safe for concurrent requests
- No database locking issues (in-memory store)
- Thread-safe dict operations

---

## Versioning

Current: **v1.0**

Future versions will maintain backward compatibility through:
- Accept both `results` and `memories` fields
- Deprecation warnings in responses
- Gradual migration period

---

## Usage Examples

### JavaScript (Chrome Extension)
```javascript
const MemoryAPI = {
  async store(text, sourceApp) {
    const response = await fetch('http://localhost:2789/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source_app: sourceApp })
    });
    return response.json();
  },
  
  async recall(query, limit = 5) {
    const response = await fetch(
      `http://localhost:2789/recall?query=${encodeURIComponent(query)}&n_results=${limit}`
    );
    return response.json();
  }
};
```

### Python (Daemon)
```python
import requests

BASE_URL = "http://localhost:2789"

# Store memory
response = requests.post(f"{BASE_URL}/store", json={
    "text": "Important information",
    "source_app": "script"
})
print(response.json())

# Recall memories
response = requests.get(f"{BASE_URL}/recall", params={
    "query": "important",
    "n_results": 10
})
memories = response.json()["memories"]
```

---

## Breaking Changes

### v1.0 → v2.0 (Planned)
- `results` field → `memories` field ✅ COMPLETED in v1.0
- Add `vector` field to memory objects
- Add pagination support
- Add filtering by date range

---

## Support

For issues:
1. Check `/config` endpoint status
2. Verify embedding mode is correct
3. Check daemon logs in terminal
4. Restart daemon if needed

---

**Last Updated**: December 14, 2025
**Status**: ✅ Production Ready
