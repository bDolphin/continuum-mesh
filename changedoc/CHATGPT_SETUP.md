# ChatGPT Actions Setup Guide

## Overview

Context Memory Mesh integrates with ChatGPT via **OpenAI GPT Actions**, allowing ChatGPT to automatically recall and store memories from your Memory Mesh daemon.

This enables natural flows like:
- **"What did I research about vector databases?"** → ChatGPT recalls stored research
- **"Remember this code pattern"** → ChatGPT stores to Memory Mesh
- **"Use my previous solution"** → ChatGPT injects relevant memories into responses

---

## Prerequisites

1. ✅ **Memory Mesh daemon running** on `http://localhost:2789`
   ```bash
   cd daemon
   source .venv/bin/activate
   uvicorn main:app --reload --port 2789
   ```

2. ✅ **OpenAI API key** with GPT-4 or later (for custom GPT actions)
   - Set in environment: `export OPENAI_API_KEY=sk-...`

3. ✅ **ChatGPT Plus or Enterprise** account (required for custom GPT creation)

4. ✅ **ngrok or similar** for remote access (if not local)
   ```bash
   ngrok http 2789
   # Returns: https://xxxx-xx-xxx-xxx-xx.ngrok.io
   ```

---

## Step-by-Step Setup

### 1. Create a Custom GPT

1. Go to **ChatGPT** → **Explore** → **Create a GPT**
2. Name it: `Memory Mesh Agent`
3. Add description: "Memory-aware AI assistant with access to your context memories"
4. Click **"Configure"** tab

### 2. Add Action Schema

1. In the Configure tab, scroll to **"Actions"** section
2. Click **"Create new action"** or **"Add action"**
3. Fill in:
   - **Schema**: Copy the OpenAPI spec from `docs/chatgpt-action.json`
   - **Authentication**: Select "None" (for local) or "Bearer Token" (for production)

**Quick copy-paste of schema:**
```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "Context Memory Mesh API",
    "version": "1.0.0"
  },
  "servers": [
    {
      "url": "http://localhost:2789",
      "description": "Local Memory Mesh Daemon"
    }
  ],
  "paths": {
    "/store": {
      "post": {
        "operationId": "storeMemory",
        "summary": "Store a memory",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "text": { "type": "string" },
                  "source_app": { "type": "string" },
                  "tags": { "type": "array", "items": { "type": "string" } }
                },
                "required": ["text", "source_app"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Memory stored",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "id": { "type": "string" },
                    "success": { "type": "boolean" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/recall": {\n      \"get\": {\n        \"operationId\": \"recallMemory\",\n        \"summary\": \"Recall memories\",\n        \"parameters\": [\n          {\n            \"name\": \"query\",\n            \"in\": \"query\",\n            \"required\": true,\n            \"schema\": { \"type\": \"string\" }\n          },\n          {\n            \"name\": \"limit\",\n            \"in\": \"query\",\n            \"schema\": { \"type\": \"integer\", \"default\": 5 }\n          }\n        ],\n        \"responses\": {\n          \"200\": {\n            \"description\": \"Memories retrieved\",\n            \"content\": {\n              \"application/json\": {\n                \"schema\": {\n                  \"type\": \"object\",\n                  \"properties\": {\n                    \"memories\": { \"type\": \"array\" },\n                    \"total_memories\": { \"type\": \"integer\" }\n                  }\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n}\n```\n\n### 3. Set Server URL\n\n**For Local Development:**\n```\nhttp://localhost:2789\n```\n\n**For Remote Access (production):**\n```\nhttps://your-ngrok-url.ngrok.io\n```\n\nOr use an SSL-enabled domain if deployed.\n\n### 4. Add System Prompt Instructions\n\nIn the custom GPT configuration, add this to your system prompt:\n\n```\nYou have access to a Memory Mesh - a persistent context store.\n\nWhen users ask about previous conversations, research, or code:\n1. Use the recallMemory action to search your context memory\n2. Include relevant findings in your response\n3. Cite the source (source_app, URL if available)\n\nWhen users want to save information:\n1. Use the storeMemory action\n2. Extract key information and tags automatically\n3. Set source_app to 'chatgpt'\n4. Confirm what was stored\n\nExamples of automatic memory usage:\n- \"What did I research about X?\" → Call recallMemory\n- \"Save this for later\" → Call storeMemory\n- \"Use my previous approach\" → recallMemory + inject into response\n```\n\n### 5. Test the Action\n\n1. In the GPT preview, try:\n   ```\n   Remember: Vector databases use embeddings for semantic search\n   ```\n   - Should call `storeMemory` action\n   - Confirm in daemon logs\n\n2. Then ask:\n   ```\n   What did I say about vector databases?\n   ```\n   - Should call `recallMemory` action\n   - Return your stored memory\n\n---\n\n## Troubleshooting\n\n### ❌ \"Action not found\" error\n\n**Cause**: ChatGPT can't reach the server\n\n**Fix**:\n- Ensure daemon is running: `lsof -i :2789`\n- Check ngrok URL is correct if using remote\n- Verify schema has correct `servers[].url`\n\n### ❌ \"Memory not stored\" but no error\n\n**Cause**: Daemon is running but `/store` endpoint issue\n\n**Fix**:\n```bash\n# Test manually\ncurl -X POST http://localhost:2789/store \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"text\": \"test\", \"source_app\": \"chatgpt\"}'\n```\n\n### ❌ CORS errors in browser console\n\n**Cause**: ChatGPT trying to call daemon but blocked\n\n**Fix**: For remote deployments, backend should return CORS headers\n\n```python\n# In daemon/main.py\nfrom fastapi.middleware.cors import CORSMiddleware\n\napp.add_middleware(\n    CORSMiddleware,\n    allow_origins=[\"*\"],\n    allow_credentials=True,\n    allow_methods=[\"*\"],\n    allow_headers=[\"*\"],\n)\n```\n\n### ❌ Localhost not accessible from ChatGPT web\n\n**Cause**: ChatGPT web client can't reach localhost\n\n**Solution**: Use ngrok tunnel\n\n```bash\n# Terminal 1: Start daemon on 2789\nuvicorn main:app --reload --port 2789\n\n# Terminal 2: Expose via ngrok\nngrok http 2789\n\n# Use ngrok URL in ChatGPT action configuration\n```\n\n---\n\n## Advanced: Using Memory Mesh in GPT Instructions\n\nYou can write complex prompts that leverage Memory Mesh:\n\n### Example 1: Project Context Injection\n```\nUser: \"How should I structure my project?\"\n\nYour response:\n1. Call recallMemory with query: \"project structure patterns\"\n2. If results found: \"Based on your previous work: [show memories]\"\n3. If no results: \"Let me suggest based on best practices...\"\n```\n\n### Example 2: Code Pattern Memory\n```\nUser: \"How did I handle authentication before?\"\n\nYour response:\n1. recallMemory(\"authentication code pattern\")\n2. Display the exact code they stored previously\n3. Offer to update if needed\n```\n\n### Example 3: Batch Store Conversations\n```\nUser: \"Save this entire conversation\"\n\nYour response:\n1. Summarize key points from conversation\n2. Call storeMemory with comprehensive summary\n3. Extract tags: [\"conversation\", ...topics discussed]\n4. Confirm: \"Saved X conversation points to Memory Mesh\"\n```\n\n---\n\n## Integration with Chrome Extension\n\nYour Chrome Extension **already integrates** with ChatGPT:\n\n1. ✅ ChatGPT sidebar shows relevant memories\n2. ✅ 📌 Store buttons on each message\n3. ✅ Auto-suggestions as you type\n4. ✅ Hotkey support (Ctrl+Shift+M to store)\n\n**To use together:**\n- Chrome extension: Passive memory capture and sidebar\n- GPT Action: Active memory usage in conversations\n\n---\n\n## API Response Format\n\nChatGPT expects these formats:\n\n### Store Response\n```json\n{\n  \"id\": \"550e8400-e29b-41d4-a716-446655440000\",\n  \"success\": true,\n  \"message\": \"Memory stored successfully\"\n}\n```\n\n### Recall Response\n```json\n{\n  \"query\": \"vector embeddings\",\n  \"memories\": [\n    {\n      \"id\": \"...\",\n      \"text\": \"Vector databases use embeddings...\",\n      \"source_app\": \"chatgpt\",\n      \"tags\": [\"vectors\", \"embeddings\"],\n      \"similarity\": 0.95\n    }\n  ],\n  \"total_memories\": 147\n}\n```\n\n---\n\n## Next Steps\n\n1. ✅ Test store/recall locally\n2. ✅ Deploy daemon to production (optional)\n3. ✅ Update GPT action with production URL\n4. ✅ Share with team for collaboration mode\n5. ✅ Create organization GPTs using Memory Mesh\n\n---\n\n## See Also\n\n- [Main README](../README.md)\n- [API Reference](API.md)\n- [Architecture Guide](ARCHITECTURE.md)\n- [Chrome Extension Docs](EXTENSION.md)\n