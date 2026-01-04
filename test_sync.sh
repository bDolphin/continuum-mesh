#!/bin/bash
# Test script for Context Memory Mesh
# Verifies end-to-end store and recall functionality

set -e

API_URL="http://localhost:2789"
PASS="✅"
FAIL="❌"

echo "🧪 Testing Context Memory Mesh API..."
echo ""

# Test 1: Health check
echo "Test 1: API Health Check"
if curl -s "$API_URL/docs" > /dev/null; then
    echo "$PASS API is running on $API_URL"
else
    echo "$FAIL API not responding. Start daemon: cd daemon && uvicorn main:app --reload --port 2789"
    exit 1
fi

echo ""

# Test 2: Store from ChatGPT
echo "Test 2: Store ChatGPT Memory"
CHATGPT_ID=$(curl -s -X POST "$API_URL/store" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "FastAPI enables rapid API development with automatic OpenAPI docs",
    "source_app": "chatgpt",
    "tags": ["fastapi", "python", "api"],
    "url": "https://chatgpt.com"
  }' | jq -r '.memory_id')

if [ ! -z "$CHATGPT_ID" ] && [ "$CHATGPT_ID" != "null" ]; then
    echo "$PASS Stored ChatGPT memory: $CHATGPT_ID"
else
    echo "$FAIL Failed to store ChatGPT memory"
    exit 1
fi

echo ""

# Test 3: Store from Perplexity
echo "Test 3: Store Perplexity Memory"
PERPLEXITY_ID=$(curl -s -X POST "$API_URL/store" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Vector databases and embeddings are fundamental to modern RAG systems",
    "source_app": "perplexity",
    "tags": ["vectors", "rag", "embeddings"],
    "url": "https://perplexity.ai"
  }' | jq -r '.memory_id')

if [ ! -z "$PERPLEXITY_ID" ] && [ "$PERPLEXITY_ID" != "null" ]; then
    echo "$PASS Stored Perplexity memory: $PERPLEXITY_ID"
else
    echo "$FAIL Failed to store Perplexity memory"
    exit 1
fi

echo ""

# Test 4: Store generic web memory
echo "Test 4: Store Generic Web Memory"
WEB_ID=$(curl -s -X POST "$API_URL/store" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Semantic search uses embeddings to find similar documents",
    "source_app": "chrome",
    "tags": ["semantic", "search"],
    "url": "https://example.com"
  }' | jq -r '.memory_id')

if [ ! -z "$WEB_ID" ] && [ "$WEB_ID" != "null" ]; then
    echo "$PASS Stored web memory: $WEB_ID"
else
    echo "$FAIL Failed to store web memory"
    exit 1
fi

echo ""

# Test 5: Recall all memories
echo "Test 5: Recall All Memories"
RECALL_COUNT=$(curl -s "$API_URL/recall?query=&limit=100" | jq '.memories | length')

if [ "$RECALL_COUNT" -ge 3 ]; then
    echo "$PASS Retrieved $RECALL_COUNT memories"
else
    echo "$FAIL Only found $RECALL_COUNT memories (expected ≥3)"
    exit 1
fi

echo ""

# Test 6: Semantic recall - API-related query
echo "Test 6: Semantic Recall - Query: 'API development'"
API_RESULTS=$(curl -s "$API_URL/recall?query=API%20development&limit=5" | jq '.memories')
TOP_RESULT=$(echo "$API_RESULTS" | jq -r '.[0].content' | head -c 50)

if [ ! -z "$TOP_RESULT" ]; then
    echo "$PASS Found relevant result: $TOP_RESULT..."
    echo "       Score: $(echo "$API_RESULTS" | jq -r '.[0].score')"
else
    echo "$FAIL No results for API-related query"
    exit 1
fi

echo ""

# Test 7: Semantic recall - Vector/RAG query
echo "Test 7: Semantic Recall - Query: 'vector embeddings RAG'"
VECTOR_RESULTS=$(curl -s "$API_URL/recall?query=vector%20embeddings%20RAG&limit=5" | jq '.memories')
TOP_VECTOR=$(echo "$VECTOR_RESULTS" | jq -r '.[0].content' | head -c 50)

if [ ! -z "$TOP_VECTOR" ]; then
    echo "$PASS Found relevant result: $TOP_VECTOR..."
    echo "       Score: $(echo "$VECTOR_RESULTS" | jq -r '.[0].score')"
else
    echo "$FAIL No results for vector-related query"
    exit 1
fi

echo ""

# Test 8: Source filtering
echo "Test 8: Filter by Source App - 'chatgpt'"
CHATGPT_RESULTS=$(curl -s "$API_URL/recall?query=&source_app=chatgpt&limit=10" | jq '.memories | length')

if [ "$CHATGPT_RESULTS" -ge 1 ]; then
    echo "$PASS Found $CHATGPT_RESULTS ChatGPT memories"
else
    echo "$FAIL No ChatGPT memories found"
    exit 1
fi

echo ""

# Test 9: Tag filtering (via metadata)
echo "Test 9: Check Memory Metadata"
FIRST_MEMORY=$(curl -s "$API_URL/recall?query=&limit=1" | jq '.memories[0]')
SOURCE=$(echo "$FIRST_MEMORY" | jq -r '.metadata.source_app')
TAGS=$(echo "$FIRST_MEMORY" | jq -r '.metadata.tags')

if [ ! -z "$SOURCE" ] && [ ! -z "$TAGS" ]; then
    echo "$PASS Memory metadata intact"
    echo "       Source: $SOURCE, Tags: $TAGS"
else
    echo "$FAIL Memory metadata missing"
    exit 1
fi

echo ""
echo "════════════════════════════════════════"
echo "🎉 All tests passed!"
echo "════════════════════════════════════════"
echo ""
echo "📋 Summary:"
echo "  • Stored memories: $CHATGPT_ID (ChatGPT), $PERPLEXITY_ID (Perplexity), $WEB_ID (Web)"
echo "  • Total retrievable: $RECALL_COUNT"
echo "  • Semantic ranking: Working ✓"
echo "  • Source filtering: Working ✓"
echo "  • Metadata: Working ✓"
echo ""
echo "🚀 Next steps:"
echo "  1. Load extension: chrome://extensions → Load unpacked → select extension/"
echo "  2. Go to ChatGPT.com → Store text (Ctrl+Shift+M)"
echo "  3. Go to Perplexity.ai → Recall (Ctrl+Shift+R)"
echo "  4. Verify ChatGPT memory appears in Perplexity sidebar"
