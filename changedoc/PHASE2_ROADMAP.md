# 🚀 PHASE 2 — Cross-App Integrations (Week 5–10)

> Automatically capture semantic context from any tool. Transform Memory Mesh from a standalone system into an omnipresent AI assistant.

---

## 📋 Overview

| Week | Feature | Status | Owner | Deliverable |
|------|---------|--------|-------|-------------|
| 5–6 | Chrome Extension v1 | 🔄 In Progress | Frontend | Extension package |
| 6–7 | ChatGPT Actions | 🔄 In Progress | API | GPT Action schema |
| 7–10 | Cursor/VSCode Plugin | 📅 Planned | Frontend | Plugin package |
| - | Testing & QA | 📅 Planned | QA | Test matrix |

---

## 🔥 2.1 Chrome Extension (Week 5–6)

### Features

#### 2.1.1 Text Capture & Memory Storage
- **Selected Text Capture**: Right-click context menu + hotkey (⌘+M / Ctrl+M)
- **Automatic Context Detection**: Classify text into categories:
  - `research` - Articles, docs, knowledge bases
  - `code` - GitHub, Stack Overflow, code snippets
  - `chat` - ChatGPT, Discord, Slack threads
  - `doc` - Notion, Google Docs, wikis
  - `email` - Email threads
- **Smart Metadata Extraction**:
  - Source URL
  - Timestamp
  - Page title
  - Selected highlight context

#### 2.1.2 Hotkey Management
```
⌘+M (Mac) / Ctrl+M (Windows/Linux): Store selected text
⌘+Shift+M (Mac) / Ctrl+Shift+M: Open memory search overlay
⌘+Option+M (Mac) / Ctrl+Alt+M: Quick recall (latest 5 memories)
```

#### 2.1.3 ChatGPT Web Integration
- **GPT Context Injection**: Auto-detect ChatGPT web, inject relevant memories into conversation
- **Memory Sidebar**: Floating panel showing top-5 relevant memories for current chat
- **Quick Insert**: Click memory to insert into message

#### 2.1.4 Perplexity Web Integration
- **Research Capture**: Auto-capture research findings
- **Citation Tracking**: Store source URLs from citations
- **Topic Clustering**: Group memories by research topic

### Implementation Details

#### 2.1.5 File Structure
```
extension/
├── manifest.json (v3)
├── background.js (Service Worker)
├── content/
│   ├── chatgpt.js
│   ├── perplexity.js
│   └── content-script.js
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── sidepanel/
│   ├── sidepanel.html
│   ├── sidepanel.js
│   └── sidepanel.css
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   ├── icon-128.png
│   └── icon-192.png
├── styles/
│   └── shared.css
└── utils/
    ├── api.js (API client)
    ├── storage.js (Local storage)
    └── detector.js (Type detection)
```

#### 2.1.6 Key APIs
```javascript
// Store memory
POST /store
{
  "text": "Selected text",
  "source_app": "chrome",
  "context_type": "research|code|chat|doc|email",
  "url": "https://...",
  "title": "Page title",
  "tags": ["tag1", "tag2"]
}

// Recall memories
GET /recall?query=search+term&limit=5&source_app=chrome
```

#### 2.1.7 Context Detection Logic
```javascript
const detectContextType = (url, selectedText) => {
  if (url.includes('github.com') || url.includes('stackoverflow.com')) return 'code';
  if (url.includes('chat.openai.com')) return 'chat';
  if (url.includes('perplexity.ai')) return 'research';
  if (url.includes('docs.google.com') || url.includes('notion.so')) return 'doc';
  if (url.includes('mail.google.com')) return 'email';
  
  // Fallback: detect by text patterns
  if (selectedText.includes('function') || selectedText.includes('const ')) return 'code';
  return 'research';
};
```

### Outcome
✅ Users capture research while browsing  
✅ Memories tagged with source and context  
✅ ChatGPT/Perplexity integration active  

### Testing Checklist
- [ ] Text selection → Storage works
- [ ] Hotkey triggers capture
- [ ] Context type auto-detection ≥90% accuracy
- [ ] ChatGPT sidebar loads and shows relevant memories
- [ ] Perplexity captures research findings
- [ ] Cross-domain CORS issues resolved
- [ ] Memory list shows recent captures

---

## 🔥 2.2 ChatGPT Integration (Week 6–7)

### Method: OpenAI GPT Actions

GPT Actions allow custom GPTs to call external APIs. We'll create two actions:
1. **recallMemory** - Query memory database
2. **storeMemory** - Save new memories

### Implementation Details

#### 2.2.1 GPT Action Schema
```yaml
# File: docs/chatgpt-action.json
openapi: 3.1.0
info:
  title: Memory Mesh API
  version: 1.0.0
servers:
  - url: http://localhost:2789

paths:
  /recall:
    get:
      operationId: recallMemory
      summary: Recall relevant memories
      parameters:
        - name: query
          in: query
          required: true
          schema:
            type: string
          description: Search query
        - name: limit
          in: query
          schema:
            type: integer
            default: 5
      responses:
        '200':
          description: Memories found
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    id:
                      type: string
                    text:
                      type: string
                    source_app:
                      type: string
                    timestamp:
                      type: string
  
  /store:
    post:
      operationId: storeMemory
      summary: Store new memory
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                text:
                  type: string
                source_app:
                  type: string
                tags:
                  type: array
                  items:
                    type: string
      responses:
        '200':
          description: Memory stored
```

#### 2.2.2 Custom GPT Instructions
```markdown
You have access to a Memory Mesh system. Before answering technical questions:

1. First, search my memory with /recall to see if I've already researched this
2. If relevant memories exist, reference them: "Based on your research..."
3. Mention the source and timestamp for context
4. After providing help, ask: "Should I save this to your memory?"

When storing memories, use /store with appropriate tags:
- "research" for explanations
- "code" for code snippets
- "solution" for problem resolutions
- "decision" for architecture choices

Always provide memory timestamps and sources in your responses.
```

#### 2.2.3 Memory Sidebar Feature
The extension injects a sidebar into ChatGPT showing:
- Top 5 relevant memories for current conversation
- Memory snippets (first 100 chars)
- Source and timestamp
- Click to insert into message

#### 2.2.4 API Endpoints Needed
```python
# In daemon/main.py, add/ensure these endpoints:

@app.get("/recall")
async def recall_memories(
    query: str,
    limit: int = 5,
    source_app: Optional[str] = None
) -> List[Dict]:
    """Recall relevant memories (for ChatGPT Actions)"""
    # Call get_embedding(query) then search
    pass

@app.post("/store")
async def store_memory(request: StoreRequest) -> Dict:
    """Store new memory (for ChatGPT Actions)"""
    # Validate, generate embedding, store
    pass

@app.get("/config")
async def get_config() -> Dict:
    """Get current embedding mode and config"""
    return {
        "embedding_mode": config.embedding_mode,
        "openai_client_ready": config.openai_client is not None
    }
```

### Outcome
✅ ChatGPT now has access to your memory  
✅ Automatic memory injection into responses  
✅ Users can save ChatGPT insights to memory  

### Testing Checklist
- [ ] GPT Action schema validates
- [ ] `recallMemory` action returns correct memories
- [ ] `storeMemory` action saves with proper metadata
- [ ] Sidebar loads in ChatGPT web UI
- [ ] Memory insertion into chat message works
- [ ] Context injection ≤500ms latency
- [ ] Error handling for API unavailability

---

## 🔥 2.3 Cursor/VSCode Plugin (Week 7–10)

### Features

#### 2.3.1 Code Context Capture
- **File Diffs**: Auto-capture git diffs of modified files
- **Commit Messages**: Store PR descriptions and commit messages
- **File Summaries**: Generate and store summaries of opened files
- **Active Context**: Inject "what I've done" into inline completions

#### 2.3.2 On-Demand Recall
- **Hotkey: Ctrl+Shift+R** (Cmd+Shift+R on Mac): Open memory search panel
- **Inline Query**: Type `@memory` in Cursor/VSCode to search memories
- **Memory Injection**: Insert relevant memory into current file as comment

#### 2.3.3 Stateful Reasoning
- **Session Context**: Track active file, recent edits, open PRs
- **Auto-Injection**: Cursor reads your memory when you:
  - Start a new feature
  - Switch between repos
  - Ask for code completion
  - Review PRs

#### 2.3.4 Architecture & Codebase Understanding
- **Repo Scanner**: Index all files in current workspace
- **Smart Recall**: "What have I already built in this codebase?"
- **Dependency Tracking**: Store library versions, imports, architecture patterns

### Implementation Details

#### 2.3.5 File Structure (VSCode Extension)
```
vscode-extension/
├── package.json
├── tsconfig.json
├── src/
│   ├── extension.ts (main entry)
│   ├── commands/
│   │   ├── captureCode.ts
│   │   ├── recall.ts
│   │   └── injectMemory.ts
│   ├── providers/
│   │   ├── completionProvider.ts
│   │   ├── hoverProvider.ts
│   │   └── sidePanelProvider.ts
│   ├── utils/
│   │   ├── api.ts (Memory API client)
│   │   ├── gitUtils.ts (Git integration)
│   │   ├── codeAnalyzer.ts
│   │   └── storage.ts
│   └── webviews/
│       ├── memoryPanel.html
│       ├── memoryPanel.ts
│       └── memoryPanel.css
├── resources/
│   └── icons/
└── test/
    └── suite/
```

#### 2.3.6 Key Commands
```typescript
// Command: capture current file
export async function captureCurrentFile() {
  const editor = vscode.window.activeTextEditor;
  const fileName = editor.document.fileName;
  const content = editor.document.getText();
  
  // Generate summary
  const summary = await generateSummary(content);
  
  // Store in memory
  await storeMemory({
    text: summary,
    source_app: 'vscode',
    context_type: 'code',
    tags: [parseLanguage(fileName), 'architecture'],
    url: `file://${fileName}`,
    title: fileName
  });
  
  vscode.window.showInformationMessage('✅ File context captured');
}

// Command: recall relevant memories
export async function recallRelevantMemories() {
  const editor = vscode.window.activeTextEditor;
  const fileName = editor.document.fileName;
  const selectedText = editor.document.getText(editor.selection);
  
  const query = selectedText || `Help with ${parseLanguage(fileName)}`;
  const memories = await recallMemories(query, 10);
  
  // Show in side panel
  showMemoryPanel(memories);
}

// Command: inject memory as comment
export async function injectMemoryAsComment() {
  const memories = await showMemoryQuickPick();
  if (memories.length === 0) return;
  
  const editor = vscode.window.activeTextEditor;
  const comment = `// Reference: ${memories[0].text}\n// Source: ${memories[0].source_app}`;
  
  editor.edit(editBuilder => {
    editBuilder.insert(editor.selection.active, comment);
  });
}
```

#### 2.3.7 Cursor Plugin (tsserver plugin)
```typescript
// cursor-plugin/src/index.ts
import type { server as ts } from 'typescript/lib/typescript';

const pluginModule: ts.server.PluginModule = {
  create(createInfo: ts.server.PluginCreateInfo) {
    const proxy = Object.create(null) as ts.LanguageService;
    const info = createInfo.languageService;
    
    // Intercept getCompletionEntryDetails
    proxy.getCompletionEntryDetails = (
      fileName: string,
      position: number,
      entryName: string
    ) => {
      // Add memory context to completions
      const originalDetails = info.getCompletionEntryDetails(
        fileName,
        position,
        entryName
      );
      
      // Fetch relevant memories
      const memories = recallMemories(entryName, 3);
      if (memories.length > 0) {
        originalDetails.documentation = memories.map(m => m.text).join('\n');
      }
      
      return originalDetails;
    };
    
    return proxy;
  }
};

export = pluginModule;
```

#### 2.3.8 Memory Panel UI (Webview)
```html
<!-- vscode-extension/src/webviews/memoryPanel.html -->
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="memoryPanel.css">
</head>
<body>
  <div id="memory-panel">
    <input type="text" id="search" placeholder="Search memories...">
    <div id="memories-list">
      <!-- Populated by JS -->
    </div>
  </div>
  <script src="memoryPanel.js"></script>
</body>
</html>
```

#### 2.3.9 Git Integration
```typescript
// utils/gitUtils.ts
export async function captureGitDiff(filePath: string) {
  const repo = await openRepository();
  const diff = await repo.diff(filePath);
  
  return {
    file: filePath,
    diff: diff,
    timestamp: new Date().toISOString()
  };
}

export async function captureCommitMessage(commitHash: string) {
  const repo = await openRepository();
  const commit = await repo.getCommit(commitHash);
  
  return {
    hash: commitHash,
    message: commit.message,
    author: commit.author.name,
    timestamp: commit.committerDate
  };
}
```

### Outcome
✅ Dev workflows now have stateful reasoning  
✅ Context automatically injected during coding  
✅ "What have I already done?" answered instantly  

### Testing Checklist
- [ ] File capture works for Python, JavaScript, TypeScript
- [ ] Hotkey (Ctrl+Shift+R / Cmd+Shift+R) opens search
- [ ] Memory injection into file as comment works
- [ ] Git diff capture ≥95% accuracy
- [ ] Sidebar loads and shows relevant memories
- [ ] Inline `@memory` query integration (optional)
- [ ] Performance: ≤1s latency for recall
- [ ] Cross-repo memory isolation works

---

## 📦 Deliverables Summary

### Chrome Extension v1
```
- manifest.json (v3)
- Full content script support for ChatGPT, Perplexity
- Hotkey binding (⌘+M)
- Context type detection
- Memory sidebar
- ~200 lines of JS
```

### ChatGPT Action v1
```
- docs/chatgpt-action.json (OpenAPI schema)
- docs/chatgpt-setup-guide.md (instructions)
- Custom GPT instructions (copy-paste)
- Test curl commands
- ~300 lines of YAML + markdown
```

### Cursor Plugin v1
```
- VSCode extension package
- Cursor tsserver plugin (optional)
- Memory panel UI
- Git integration
- Commands: capture, recall, inject
- ~500 lines of TypeScript
```

### VSCode Extension v1 (Optional)
```
- Full VSCode extension
- Side panel integration
- Hover provider for memory hints
- Completion provider enhancement
- ~400 lines of TypeScript
```

---

## 🧪 Testing Matrix

| Feature | Chrome | ChatGPT | Cursor | VSCode |
|---------|--------|---------|--------|--------|
| Text capture | ✅ | ✅ (via action) | ✅ | ✅ |
| Hotkey trigger | ✅ | ❌ | ✅ | ✅ |
| Memory recall | ✅ | ✅ | ✅ | ✅ |
| Auto-injection | ✅ | ✅ | ✅ | ✅ |
| Context detection | ✅ | ❌ | ✅ | ✅ |
| Sidebar UI | ✅ | ✅ | ✅ | ✅ |
| Git integration | ❌ | ❌ | ✅ | ✅ |

---

## 📅 Timeline & Milestones

### Week 5
- [ ] Chrome extension scaffold + manifest
- [ ] Text capture + hotkey binding
- [ ] Context detection MVP
- **Milestone**: "Chrome extension captures text"

### Week 6
- [ ] ChatGPT sidebar integration
- [ ] Perplexity content script
- [ ] ChatGPT Actions schema (v1)
- **Milestone**: "ChatGPT sidebar shows memories"

### Week 7
- [ ] GPT Actions testing + refinement
- [ ] VSCode extension scaffold
- [ ] Memory panel UI
- **Milestone**: "ChatGPT stores & recalls memories"

### Week 8–10
- [ ] Git integration
- [ ] Cursor tsserver plugin
- [ ] E2E testing + QA
- [ ] Documentation
- **Milestone**: "Stateful dev workflow complete"

---

## 🎯 Success Metrics

- ✅ Chrome extension installs without errors
- ✅ Text capture latency <100ms
- ✅ ChatGPT sidebar loads <500ms
- ✅ Memory recall accuracy >85% (semantic matching)
- ✅ VSCode extension doesn't slow IDE (<50ms overhead)
- ✅ Git diff capture works for all file types
- ✅ Zero runtime errors in beta testing
- ✅ User satisfaction: ≥4.5/5 stars on extension stores

---

## 🚨 Known Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| CORS issues with ChatGPT web | Use content script workaround + ngrok for local testing |
| Rate limiting on OpenAI API | Batch requests, implement local caching |
| VSCode extension performance | Lazy-load memory panel, debounce searches |
| Git integration complexity | Start with simple diff capture, expand later |
| Cross-extension conflicts | Test on clean VS Code instance, use unique command names |

---

## 📝 Notes for Implementation

1. **API Stability**: Ensure `/store` and `/recall` endpoints are production-ready before Phase 2
2. **Authentication**: For remote deployments, add API key support (skip for MVP local)
3. **Storage**: Chrome extension uses `chrome.storage.local` (no server sync needed yet)
4. **Embedding Quality**: Test context detection with ≥50 real examples
5. **Extension Store**: Prepare privacy policy + screenshots for Chrome Web Store submission

---

**Status**: 📋 Ready for Sprint Planning  
**Last Updated**: 2025-12-14  
**Next Review**: End of Week 7
