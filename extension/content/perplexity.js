/**
 * Perplexity.ai Content Script - Research-Focused Integration
 * 
 * Features:
 * - Research sidebar with memory suggestions
 * - Citation tracking and source extraction
 * - Topic clustering and auto-tagging
 * - One-click research capture
 */

// Use global instances from loaded utility scripts
// MemoryAPI, ContextDetector, and StorageManager are available from utils/

const processedMessages = new Set();
let researchSidebar = null;
let lastQuery = '';
let searchTimeoutId = null;

/**
 * Debounce helper to prevent rapid re-renders
 */
function debounce(func, wait) {
  return function(...args) {
    clearTimeout(searchTimeoutId);
    searchTimeoutId = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * Recall memories by calling the local daemon DIRECTLY from the content script.
 *
 * Why not go through the background service worker?
 * In Manifest V3 the worker is suspended when idle and can be torn down mid-
 * request, which silently drops its sendResponse — that's the 20s "Memory
 * search timeout" you saw. Chrome treats http://localhost / http://127.0.0.1 as
 * a trustworthy origin, so an https page like perplexity.ai is allowed to fetch
 * it with no mixed-content block (the daemon is also in host_permissions).
 *
 * Returns { memories: [...] } and never throws — callers get [] on any failure.
 */
const DAEMON_URL = 'http://localhost:2789';
async function recallFromDaemon(query, limit = 5, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const params = new URLSearchParams({ query: query, n_results: String(limit) });
    const res = await fetch(`${DAEMON_URL}/recall?${params}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Daemon HTTP ${res.status}`);
    const data = await res.json();
    return { memories: data.memories || [] };
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('⏱️ Recall timed out (daemon slow or not running)');
    } else {
      console.warn('Recall failed:', error.message);
    }
    return { memories: [] };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract research findings with citations and sources
 */
function extractResearchFindings() {
  const findings = [];
  
  // Main answer container
  const answerElements = document.querySelectorAll(
    '[class*="answer"], [class*="response"], [class*="prose"], article, main > div'
  );
  
  answerElements.forEach(el => {
    const text = el.textContent.trim();
    if (text.length > 50) {
      const citations = extractCitations(el);
      const sources = extractSources(el);
      
      findings.push({
        text: text.substring(0, 500),
        citations,
        sources,
        timestamp: Date.now()
      });
    }
  });
  
  return findings;
}

/**
 * Extract citation references [1], [2], etc.
 */
function extractCitations(element) {
  const citations = [];
  const citationPattern = /\[(\d+)\]/g;
  const text = element.textContent;
  let match;
  
  while ((match = citationPattern.exec(text)) !== null) {
    citations.push(parseInt(match[1]));
  }
  
  return [...new Set(citations)];
}

/**
 * Extract source URLs and titles from Perplexity's citation links
 */
function extractSources(element) {
  const sources = [];
  const links = element.querySelectorAll('a[href]');
  
  links.forEach(link => {
    const href = link.getAttribute('href');
    const text = link.textContent.trim();
    
    if (href && text && (href.startsWith('http') || href.startsWith('/'))) {
      sources.push({
        title: text,
        url: href,
        domain: new URL(href, window.location.origin).hostname
      });
    }
  });
  
  return sources;
}

/**
 * Create and inject research sidebar
 */
function injectResearchSidebar() {
  if (researchSidebar) return;
  
  const sidebar = document.createElement('div');
  sidebar.id = 'memory-mesh-research-sidebar';
  sidebar.style.cssText = `
    position: fixed;
    right: 0;
    top: 0;
    width: 320px;
    height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 16px;
    overflow-y: auto;
    z-index: 9999;
    box-shadow: -2px 0 10px rgba(0,0,0,0.2);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;
  
  sidebar.innerHTML = `
    <div style="margin-bottom: 16px;">
      <div style="font-size: 14px; font-weight: 600; opacity: 0.9;">RESEARCH MEMORY</div>
      <input 
        type="text" 
        id="research-search" 
        placeholder="Search memories..."
        style="width: 100%; padding: 8px; margin-top: 8px; border: none; border-radius: 4px; background: rgba(255,255,255,0.2); color: white;" 
      />
      <input 
        type="text" 
        id="research-filter-topic" 
        placeholder="Filter by topic..."
        style="width: 100%; padding: 8px; margin-top: 8px; border: none; border-radius: 4px; background: rgba(255,255,255,0.2); color: white;" 
      />
    </div>
    
    <div id="research-memories" style="margin-bottom: 16px;"></div>
    
    <button 
      id="store-research-btn" 
      style="
        width: 100%;
        padding: 10px;
        background: rgba(255,255,255,0.2);
        color: white;
        border: 1px solid rgba(255,255,255,0.3);
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
      "
    >📌 Store This Research</button>
    
    <button 
      id="close-sidebar-btn" 
      style="
        width: 100%;
        padding: 10px;
        margin-top: 8px;
        background: rgba(0,0,0,0.2);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
      "
    >✕ Close</button>
  `;
  
  if (document.body) {
    document.body.appendChild(sidebar);
  }
  researchSidebar = sidebar;
  
  // Event listeners
  const storeBtn = document.getElementById('store-research-btn');
  const closeBtn = document.getElementById('close-sidebar-btn');
  const searchInput = document.getElementById('research-search');
  
  if (storeBtn) storeBtn.onclick = () => storeCurrentResearch();
  if (closeBtn) closeBtn.onclick = () => closeSidebar();
  if (searchInput) searchInput.oninput = (e) => searchResearchMemories(e.target.value);
  document.getElementById('research-filter-topic').oninput = (e) => filterByTopic(e.target.value);
}

/**
 * Store current research findings - simplified format
 */
async function storeCurrentResearch() {
  const findings = extractResearchFindings();
  const question = extractCurrentQuestion();
  
  // Get all text and create a summary
  const allText = findings.map(f => f.text).join('\n\n');
  
  // Validate we have content to store
  if (!allText || allText.trim().length === 0) {
    showNotification('No research content found to store', 'warning');
    return;
  }
  
  // Check chrome.runtime is available BEFORE starting
  if (!chrome || !chrome.runtime) {
    showNotification('Extension context lost - please reload the page', 'error');
    return;
  }
  
  // Create a plain text summary (keep it under 5000 chars)
  let summary = allText.substring(0, 4000);
  if (summary.length > 0 && !summary.endsWith('.')) {
    const lastPeriod = summary.lastIndexOf('.');
    if (lastPeriod > 0) {
      summary = summary.substring(0, lastPeriod + 1);
    }
  }
  
  // Add question as header if available
  let finalText = summary;
  if (question) {
    finalText = `Question: ${question}\n\n${summary}`;
  }
  
  // Flatten to minimal required fields only
  const memoryData = {
    text: finalText,
    source_app: 'perplexity',
    tags: ['research', 'perplexity']
  };
  
  // Log the memory data being sent
  console.log('📤 Sending memory data to service worker:', {
    text_length: memoryData.text.length,
    source_app: memoryData.source_app,
    tags: memoryData.tags
  });
  
  try {
    // Store reference to sendMessage before async operation
    const sendMsg = chrome.runtime.sendMessage;
    
    sendMsg(
      {
        type: 'STORE_MEMORY',
        data: memoryData,
      },
      (response) => {
        try {
          // Check if extension context is still available
          if (!chrome || !chrome.runtime || !response) {
            console.error('❌ Extension context lost during callback');
            showNotification('Extension context lost - please reload the page', 'error');
            return;
          }
          
          console.log('📨 Service worker response:', response);
          
          // Check for runtime errors
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message || 'Unknown error';
            console.error('❌ Chrome runtime error:', errorMsg);
            showNotification('Extension error - please reload', 'error');
            return;
          }
          
          console.log('Response success:', response.success, 'Error:', response.error);
          
          if (response.success) {
            console.log('✅ Memory stored successfully:', response.data);
            showNotification('✅ Research stored to Memory Mesh!', 'success');
            updateResearchSidebar();
          } else if (response.error) {
            console.error('❌ Daemon returned error:', response.error);
            showNotification(`❌ Failed to store: ${response.error}`, 'error');
          } else {
            console.error('❌ Unknown response format:', response);
            showNotification('❌ Failed to store research', 'error');
          }
        } catch (e) {
          console.error('❌ Error processing response:', e);
          showNotification(`❌ Error: ${e.message}`, 'error');
        }
      }
    );
  } catch (e) {
    console.error('❌ Failed to send store message:', e);
    showNotification(`❌ Error: ${e.message || 'Failed to store research'}`, 'error');
  }
}

/**
 * Extract the research question from page
 */
function extractCurrentQuestion() {
  // Try input field
  const input = document.querySelector('input[type="text"], input[type="search"]');
  if (input && input.value) return input.value;
  
  // Try URL parameter
  const params = new URLSearchParams(window.location.search);
  if (params.has('q')) return params.get('q');
  
  return '';
}

/**
 * Update sidebar with relevant memories
 */
async function updateResearchSidebar() {
  const query = extractCurrentQuestion();
  if (!query || query === lastQuery) return;
  
  lastQuery = query;

  try {
    const startTime = Date.now();
    console.log('🔍 Searching memories for query:', query.substring(0, 50) + '...');

    // Call the daemon directly — avoids the MV3 service-worker suspend/timeout bug.
    const response = await recallFromDaemon(query, 5);
    console.log(`✅ Memory search completed in ${Date.now() - startTime}ms`);

    const memories = response?.memories || [];
    const container = document.getElementById('research-memories');
    if (!container) return;

    if (memories.length === 0) {
      container.innerHTML = '<div style="font-size: 12px; opacity: 0.7;">No related memories yet</div>';
      return;
    }
    
    container.innerHTML = memories.map((mem, i) => {
      // Handle both old format (text) and new format (content)
      const memText = mem.text || mem.content || '';
      const memTags = mem.tags || ['memory'];
      
      if (!memText) return ''; // Skip if no content
      
      // Escape special characters for data attribute
      const escapedText = memText.replace(/"/g, '&quot;').replace(/\n/g, '\\n');
      
      return `
        <div class="memory-item" data-memory-text="${escapedText}" style="
          background: rgba(255,255,255,0.1);
          padding: 8px;
          border-radius: 4px;
          margin-bottom: 8px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        " onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">
          <div style="font-weight: 500; margin-bottom: 4px;">${Array.isArray(memTags) ? memTags[0] : 'memory'}</div>
          <div style="opacity: 0.9;">${memText.substring(0, 80)}...</div>
        </div>
      `;
    }).filter(Boolean).join('');
    
    // Add event listeners to memory items
    const memoryItems = container.querySelectorAll('.memory-item');
    memoryItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = item.getAttribute('data-memory-text');
        if (text) {
          insertMemoryIntoPerplexity(text);
        }
      });
    });
  } catch (error) {
    if (error.message && error.message.includes('timeout')) {
      console.warn('Memory search timeout - daemon may be busy');
    } else {
      console.error('Failed to update research sidebar:', error);
    }
  }
}

/**
 * Search research memories (debounced to prevent flickering)
 */
const searchResearchMemories = debounce(async function(query) {
  if (!query) {
    updateResearchSidebar();
    return;
  }
  
  try {
    const startTime = Date.now();
    console.log('🔍 Searching memories for query:', query.substring(0, 50) + '...');

    // Call the daemon directly — avoids the MV3 service-worker suspend/timeout bug.
    const response = await recallFromDaemon(query, 5);
    console.log(`✅ Memory search completed in ${Date.now() - startTime}ms`);

    const memories = response?.memories || [];
    const container = document.getElementById('research-memories');
    if (!container) return;

    if (memories.length === 0) {
      container.innerHTML = '<div style="opacity: 0.7; font-size: 12px;">No results</div>';
      return;
    }
    
    container.innerHTML = memories.map(mem => {
      // Handle both old format (text) and new format (content)
      const memText = mem.text || mem.content || '';
      const memTags = mem.tags || ['memory'];
      
      if (!memText) return ''; // Skip if no content
      
      // Escape special characters for data attribute
      const escapedText = memText.replace(/"/g, '&quot;').replace(/\n/g, '\\n');
      
      return `
        <div class="memory-item" data-memory-text="${escapedText}" style="background: rgba(255,255,255,0.1); padding: 8px; border-radius: 4px; margin-bottom: 8px; font-size: 12px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">
          <div style="font-weight: 500;">${Array.isArray(memTags) ? memTags[0] : 'memory'}</div>
          <div style="opacity: 0.9;">${memText.substring(0, 80)}...</div>
        </div>
      `;
    }).filter(Boolean).join('');
    
    // Add event listeners to memory items
    const memoryItems = container.querySelectorAll('.memory-item');
    memoryItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = item.getAttribute('data-memory-text');
        if (text) {
          insertMemoryIntoPerplexity(text);
        }
      });
    });
  } catch (error) {
    if (error.message && error.message.includes('timeout')) {
      console.warn('Memory search timeout - daemon may be busy');
    } else {
      console.error('Failed to search memories:', error);
    }
  }
}, 300); // Debounce search to prevent flickering

/**
 * Filter memories by topic
 */
async function filterByTopic(topic) {
  if (!topic) {
    updateResearchSidebar();
    return;
  }
  
  // In a full implementation, this would query the backend with tag filters
  const allMemories = window.StorageManager ? await window.StorageManager.getLastMemories() : [];
  const filtered = allMemories.filter(m => 
    m.tags && m.tags.some(tag => tag.toLowerCase().includes(topic.toLowerCase()))
  );
  
  const container = document.getElementById('research-memories');
  if (!container) return;
  
  container.innerHTML = filtered.map(mem => `
    <div style="background: rgba(255,255,255,0.1); padding: 8px; border-radius: 4px; margin-bottom: 8px; font-size: 12px;">
      <div style="font-weight: 500;">${mem.tags?.[0] || 'memory'}</div>
      <div>${mem.text.substring(0, 80)}...</div>
    </div>
  `).join('') || '<div style="opacity: 0.7; font-size: 12px;">No topics match</div>';
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
  const colors = {
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6'
  };
  
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    background: ${colors[type]};
    color: white;
    padding: 12px 16px;
    border-radius: 6px;
    z-index: 99999;
    font-size: 14px;
    animation: slideUp 0.3s ease;
  `;
  notification.textContent = message;
  if (document.body) {
    document.body.appendChild(notification);
  }
  
  setTimeout(() => notification.remove(), 3000);
}

/**
 * Close sidebar
 */
function closeSidebar() {
  if (researchSidebar) {
    researchSidebar.remove();
    researchSidebar = null;
  }
}

/**
 * Insert memory into Perplexity chat input
 */
function insertMemoryIntoPerplexity(text) {
  try {
    // Validate text exists
    if (!text || typeof text !== 'string') {
      console.error('❌ Invalid memory text:', text);
      showNotification('❌ Invalid memory content');
      return;
    }
    
    // Try multiple selectors for Perplexity's input
    let input = document.querySelector('textarea')
      || document.querySelector('[contenteditable="true"][role="textbox"]')
      || document.querySelector('[data-testid="input"]')
      || document.querySelector('input[type="text"][placeholder*="ask"]')
      || document.querySelector('input[type="text"][placeholder*="Ask"]');

    if (input) {
      // Handle textarea
      if (input.tagName === 'TEXTAREA') {
        const before = input.value;
        input.value = before + (before ? '\n' : '') + text;
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('✅ Memory inserted into textarea');
        showNotification('✅ Memory inserted!');
      }
      // Handle contenteditable div
      else if (input.contentEditable === 'true') {
        input.textContent += (input.textContent ? '\n' : '') + text;
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        console.log('✅ Memory inserted into contenteditable');
        showNotification('✅ Memory inserted!');
      }
      // Handle regular input
      else if (input.tagName === 'INPUT') {
        const before = input.value;
        input.value = before + (before ? ' ' : '') + text;
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('✅ Memory inserted into input');
        showNotification('✅ Memory inserted!');
      }
    } else {
      // Fallback: copy to clipboard
      console.warn('⚠️ Input element not found, copying to clipboard');
      navigator.clipboard.writeText(text).then(() => {
        console.log('✅ Copied to clipboard');
        showNotification('✅ Copied to clipboard - paste manually');
      }).catch((err) => {
        console.error('❌ Clipboard write failed:', err);
        showNotification('❌ Could not insert. Try pasting manually.');
      });
    }
  } catch (error) {
    console.error('❌ Error inserting memory:', error);
    showNotification('❌ Error inserting memory: ' + error.message);
  }
}

/**
 * Initialize Perplexity integration
 */
function init() {
  console.log('Memory Mesh: Perplexity research integration initialized');
  
  // Inject sidebar on page load
  setTimeout(() => injectResearchSidebar(), 500);
  
  // Listen for hotkeys
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
      e.preventDefault();
      storeCurrentResearch();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
      e.preventDefault();
      if (researchSidebar) closeSidebar();
      else injectResearchSidebar();
    }
  });
  
  // Update sidebar when content changes
  const observer = new MutationObserver(() => {
    clearTimeout(window.perplexityDebounce);
    window.perplexityDebounce = setTimeout(() => updateResearchSidebar(), 500);
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: false
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}