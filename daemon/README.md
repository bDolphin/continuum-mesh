# Memory Daemon

FastAPI-based memory storage daemon with semantic search capabilities.

## Features

- **Dual Embedding Modes**: Choose between testing mode (hash-based) or OpenAI embeddings
- **Semantic Search**: Query memories using natural language
- **ChromaDB Storage**: Local-first vector database
- **CORS Enabled**: Works with browser extensions and web UIs

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure Embedding Mode

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` to choose your embedding mode:

**Testing Mode (Default - No API Key Required):**
```env
EMBEDDING_MODE=testing
```

**OpenAI Mode (Requires API Key):**
```env
EMBEDDING_MODE=openai
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx
```

Get your OpenAI API key from: https://platform.openai.com/api-keys

### 3. Run the Daemon

```bash
python main.py
```

The daemon will start on `http://0.0.0.0:2789`

## Embedding Modes

### Testing Mode (Hash-Based)
- **Pros**: No API key required, instant, free, works offline
- **Cons**: Not true semantic search (uses SHA-256 hash)
- **Use Case**: Development, testing, demos without API costs

### OpenAI Mode
- **Pros**: True semantic search with `text-embedding-3-small` model
- **Cons**: Requires API key, costs money per request
- **Use Case**: Production use with real semantic understanding

## API Endpoints

### `GET /`
Health check and configuration status

### `GET /config`
View current embedding mode and available options

### `POST /store`
Store a new memory with metadata

### `GET /recall?query=<text>&n_results=10`
Semantic search for memories. Empty query returns all memories.

### `GET /memories?limit=100`
List all stored memories

### `DELETE /memory/{memory_id}`
Delete a specific memory

## Switching Modes

1. Stop the daemon (Ctrl+C)
2. Edit `.env` and change `EMBEDDING_MODE`
3. Restart the daemon

**Note**: Embeddings from different modes are not compatible. If you switch modes, you may want to clear your ChromaDB database or re-index your memories.

## Environment Variables

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `EMBEDDING_MODE` | `testing`, `openai` | `testing` | Embedding generation method |
| `OPENAI_API_KEY` | `sk-...` | - | OpenAI API key (required for openai mode) |

## Development

The daemon automatically falls back to testing mode if:
- OpenAI mode is selected but no API key is provided
- OpenAI package is not installed
- OpenAI API request fails

Check the console output on startup to see which mode is active:
- `🧪 Using testing mode (hash-based embeddings)`
- `✅ OpenAI embeddings enabled`
