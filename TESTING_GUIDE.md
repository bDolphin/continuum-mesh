# Comprehensive Testing Guide - Continuum Mesh Extension

## Quick Start
1. Reload extension in Chrome (`chrome://extensions` → toggle off/on)
2. Open Chrome DevTools (F12 or Cmd+Option+J)
3. Click on Service Worker console tab to see background.js logs
4. Click on Content Script tab to see chatgpt.js/perplexity.js logs
5. Perform action and check console for emoji-prefixed logs

---

## Logging Locations & What to Look For

### 1. Service Worker Console (background.js)

**When Storing Memory:**
```
📥 Service worker received STORE_MEMORY: {
  text_length: 125,
  source_app: "chatgpt",
  has_data: true
}
✅ storeMemory returned: { success: true, memory_id: "mem_abc123" }
📦 Cache updated with new memory
📤 Sending response to content script: { success: true, data: {...} }
```

**When Recalling Memory:**
```
📥 Service worker received RECALL_MEMORIES: {
  query: "research on AI",
  source_app: "chatgpt",
  n_results: 10
}
✅ recallMemories returned: { success: true, memories_count: 3 }
📤 Sending response to content script: { success: true, data: {...} }
```

**On Error:**
```
❌ Store error in service worker: [error message] [error object]
```

---

### 2. Content Script Console (chatgpt.js / perplexity.js)

**Perplexity - When Storing Research:**
```
📤 Sending memory data to service worker: {
  text_length: 456,
  source_app: "perplexity",
  tags: ["research", "perplexity"],
  question: "What is quantum computing?",
  sources_count: 5,
  citations_count: 12
}
📨 Service worker response: { success: true, data: {...} }
Response success: true Error: undefined
✅ Memory stored successfully: { memory_id: "mem_xyz789", message: "..." }
```

**ChatGPT - When Storing Memory:**
```
📤 Sending memory data to service worker: {
  text_length: 234,
  source_app: "chatgpt",
  context_type: "chat",
  tags: ["chatgpt", "chat"]
}
📨 Service worker response: { success: true, data: {...} }
Response success: true Error: undefined
✅ Memory stored successfully: { memory_id: "mem_abc123", message: "..." }
```

**On Error in Content Script:**
```
❌ Daemon returned error: "Error details here"
📥 Service worker received STORE_MEMORY: {...}
```

---

## Test Scenarios

### Test 1: Store Memory from ChatGPT ✅
**Steps:**
1. Go to ChatGPT (chat.openai.com)
2. Have a conversation
3. Highlight text and click "Save to Memory Mesh"
4. Check console logs

**Expected Output:**
- Console: `📤 Sending memory data...`
- Console: `📨 Service worker response...`
- Console: `✅ Memory stored successfully...`
- UI: "✅ Saved to memory!" toast notification

**If Error:**
- Console: `❌ Daemon returned error: [specific message]`
- UI: "❌ Failed: [specific error]" toast

---

### Test 2: Store Memory from Perplexity ✅
**Steps:**
1. Go to Perplexity (perplexity.ai)
2. Search for something and wait for results
3. Result should auto-save (or manually trigger from UI)
4. Check console logs

**Expected Output:**
- Console: `📤 Sending memory data...` (with sources_count, citations_count)
- Console: `📨 Service worker response...`
- Console: `✅ Memory stored successfully...`
- UI: "✅ Research stored to Memory Mesh!" or similar

**If Error:**
- Console: `❌ Daemon returned error: [specific message]`
- UI: Error message displayed in popup

---

### Test 3: Recall Memories ✅
**Steps:**
1. Open Chrome DevTools
2. Go to any website
3. Click extension icon → search for something
4. Check console logs

**Expected Output (Service Worker):**
- Console: `📥 Service worker received RECALL_MEMORIES: {query: "...", ...}`
- Console: `✅ recallMemories returned: { success: true, memories_count: 3 }`
- Console: `📤 Sending response to content script...`

**Expected Output (Content Script):**
- Console: Similar logging showing response received
- UI: Memory panel populated with results

**If Error:**
- Console in service worker: `❌ Recall error in service worker: [error]`
- UI: Error message in memory panel

---

### Test 4: Error Handling - Invalid Data
**Steps:**
1. Open DevTools
2. Manually trigger store with invalid data (empty text, etc.)
3. Check error handling

**Expected:**
- Console: Validation error message
- UI: Specific error message (not [object Object])
- Service worker keeps running (no crash)

---

### Test 5: Cross-Origin Communication
**Steps:**
1. Open DevTools
2. Store from one site, recall from another
3. Verify cross-origin message passing works

**Expected:**
- Logs flow through service worker regardless of origin
- Memory stored and retrieved successfully

---

## Console Structure (DevTools)

### Location 1: Service Worker (for background.js logs)
```
Chrome DevTools → Sources → Service Workers → (list) → [extension name]
OR
Chrome DevTools → Application → Service Workers → Inspector
```
**Show logs from:** `📥`, `✅`, `❌`, `📦`, `📤`

### Location 2: Content Script (for chatgpt.js/perplexity.js logs)
```
Chrome DevTools → Console (on page with active content script)
```
**Show logs from:** `📤`, `📨`, `✅`, `❌`

### Location 3: Extension Popup (for popup.js logs)
```
Open extension popup → F12 → Console
```

---

## Emoji Legend

| Emoji | Meaning | Context |
|-------|---------|---------|
| 📥 | Incoming message | Service worker received data |
| 📤 | Outgoing response | Service worker/content script sending response |
| 📨 | Response received | Content script got service worker response |
| 📦 | Cache operation | Memory cache updated |
| ✅ | Success | Operation completed successfully |
| ❌ | Error | Operation failed with specific error |
| ⚠️ | Warning | Non-critical issue (e.g., cache update failed) |

---

## Debugging Workflow

### If logs don't appear:
1. **Service Worker:**
   - Go to `chrome://extensions`
   - Enable "Developer Mode"
   - Click "Inspect" on Continuum Mesh
   - Reload extension with F5
   - Trigger action and watch logs

2. **Content Script:**
   - Open any website with extension active
   - Press F12 to open DevTools
   - Go to Console tab
   - Trigger action and watch logs

### If logs show [object Object]:
- This indicates unhandled error serialization
- Check console for more context (may show multiple log lines)
- Error handling now improved to extract error.detail or error.message

### If no response received:
- Check service worker console for 📥 log (message received?)
- Check network tab to see if fetch to daemon completed
- Check daemon logs: `tail -f daemon_output.log`

---

## Common Issues & Solutions

### Issue: No logs appearing
**Solution:** Ensure DevTools is open before triggering action

### Issue: "Extension context invalidated"
**Solution:** Reload extension (`chrome://extensions` → toggle off/on)

### Issue: Memory not being stored
**Solution:** Check if daemon is running (`ps aux | grep main.py`)

### Issue: Logs show errors but UI shows nothing
**Solution:** Check if error notification is displaying (check CSS z-index)

---

## What To Verify ✅

After deploying new code:
- [ ] Service worker receives STORE_MEMORY messages
- [ ] Content script sends correct memory data structure
- [ ] Service worker fetches to daemon successfully
- [ ] Response contains memory_id (not just id)
- [ ] Cache is updated with new memory
- [ ] Response sent back to content script
- [ ] Content script displays success notification
- [ ] Errors show specific messages (not [object Object])
- [ ] No console errors or warnings
- [ ] Service worker keeps running (no crashes)

---

## Performance Indicators

### Good Performance:
- Store completes in < 500ms
- Recall completes in < 1000ms
- No error messages in console
- All emoji prefixes appearing in expected order

### Poor Performance:
- Logs appear out of order
- Timeout messages appearing (5s fetch timeout)
- Cache update taking > 100ms

---

## Next Steps After Testing

1. If all logs appear in correct order ✅ → Ready for production
2. If some logs missing ⚠️ → Check service worker lifecycle
3. If errors shown ❌ → Check daemon logs for details
4. If [object Object] still appearing → Server error format needs fixing

---

## Daemon Testing

To test daemon independently:

```bash
# Store request
curl -X POST http://localhost:2789/store \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Test memory",
    "source_app": "test",
    "tags": ["test"]
  }'

# Should return: {"success": true, "memory_id": "...", "message": "..."}
```

If daemon returns error, check:
- Daemon is running (`ps aux | grep main.py`)
- Port 2789 is accessible (`lsof -i :2789`)
- Daemon logs for errors (`tail -f daemon.log`)

