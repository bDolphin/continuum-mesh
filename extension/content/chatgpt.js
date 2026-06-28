/**
 * ChatGPT Integration Content Script
 * Injects memory sidebar and auto-suggests relevant memories
 * Location: extension/content/chatgpt.js
 */

let chatPanel = null;
const PANEL_WIDTH = 320;
const processedMessages = new Set();

// Debounce helper for reducing rapid function calls
let updateMemorySuggestionsTimeoutId = null;
function debounceUpdateMemorySuggestions() {
  clearTimeout(updateMemorySuggestionsTimeoutId);
  updateMemorySuggestionsTimeoutId = setTimeout(() => {
    updateMemorySuggestions();
  }, 500); // Wait 500ms after last change before updating
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initChatGPTIntegration);
} else {
  initChatGPTIntegration();
}

function initChatGPTIntegration() {
  console.log('✅ Initializing ChatGPT Memory Mesh integration');

  // Inject sidebar
  injectMemorySidebar();

  // Cycle 5 D3: auto-inject relevant context from a debounced draft watcher.
  // The watcher is generic; we just hand it the ChatGPT-specific composer
  // selectors so the same module can extend to Perplexity/Claude later.
  if (window.__continuumAutoInject) {
    window.__continuumAutoInject.init({
      sourceTag: 'chatgpt',
      composerSelectors: [
        '#prompt-textarea',
        'div[contenteditable="true"][id="prompt-textarea"]',
        'textarea[data-id="root"]',
        'textarea[placeholder*="Message" i]',
        '[contenteditable="true"][role="textbox"]',
      ],
    });
  }

  // Watch for messages
  observeChatMessages();

  // Update suggestions on message change (debounced to reduce spam)
  const observer = new MutationObserver(() => {
    try {
      debounceUpdateMemorySuggestions();
    } catch (error) {
      console.error('Error in mutation observer:', error);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: false,
  });
}

function injectMemorySidebar() {
  // Check if sidebar already exists
  if (document.getElementById('memory-mesh-sidebar')) return;

  // Create sidebar
  const sidebar = document.createElement('div');
  sidebar.id = 'memory-mesh-sidebar';
  sidebar.style.cssText = `
    position: fixed;
    right: 0;
    top: 0;
    width: ${PANEL_WIDTH}px;
    height: 100vh;
    background: white;
    border-left: 1px solid #e5e5e5;
    z-index: 9999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    display: flex;
    flex-direction: column;
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
    animation: slideIn 0.3s ease-out;
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 16px;
    border-bottom: 1px solid #e5e5e5;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    font-weight: 600;
    font-size: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  header.innerHTML = `
    <span>🧠 Memory Mesh</span>
    <button id="memory-toggle-btn" style="
      background: rgba(255,255,255,0.2);
      border: none;
      color: white;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
    ">Hide</button>
  `;

  // Search box
  const searchBox = document.createElement('input');
  searchBox.id = 'memory-search-box';
  searchBox.type = 'text';
  searchBox.placeholder = 'Search memories...';
  searchBox.style.cssText = `
    margin: 12px;
    padding: 8px 12px;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    font-size: 13px;
    width: calc(100% - 28px);
    background-color: #ffffff;
    color: #333333;
  `;
  searchBox.addEventListener('focus', () => {
    searchBox.style.backgroundColor = '#ffffff';
  });

  searchBox.addEventListener('input', debounce((e) => {
    const query = e.target.value;
    if (query.length > 2) {
      searchMemories(query);
    }
  }, 300));

  // Content area
  const content = document.createElement('div');
  content.id = 'memory-content';
  content.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 12px;
  `;

  // Store button
  const storeBtn = document.createElement('button');
  storeBtn.id = 'memory-store-btn';
  storeBtn.textContent = '💾 Store Conversation';
  storeBtn.style.cssText = `
    margin: 12px;
    padding: 10px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: opacity 0.2s;
  `;

  storeBtn.onmouseover = () => (storeBtn.style.opacity = '0.9');
  storeBtn.onmouseout = () => (storeBtn.style.opacity = '1');
  storeBtn.onclick = storeCurrentConversation;

  sidebar.appendChild(header);
  sidebar.appendChild(searchBox);
  sidebar.appendChild(content);
  sidebar.appendChild(storeBtn);

  if (document.body) {
    document.body.appendChild(sidebar);
  }

  // Toggle button handler
  const toggleBtn = header.querySelector('#memory-toggle-btn');
  toggleBtn.onclick = () => {
    const isVisible = sidebar.style.right !== `-${PANEL_WIDTH}px`;
    sidebar.style.right = isVisible ? `-${PANEL_WIDTH}px` : '0';
    toggleBtn.textContent = isVisible ? 'Show' : 'Hide';
  };

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(${PANEL_WIDTH}px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    #memory-search-box {
      color: #333333 !important;
      background-color: #ffffff !important;
    }
    #memory-search-box::placeholder {
      color: #999999 !important;
    }
  `;
  if (document.head) {
    document.head.appendChild(style);
  }
}

function observeChatMessages() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            const messages = node.querySelectorAll('[data-message-id]') || [];
            messages.forEach(addStoreButtonToMessage);
          }
        });
      }
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function addStoreButtonToMessage(messageElement) {
  if (messageElement.querySelector('.memory-store-msg-btn')) return;

  const button = document.createElement('button');
  button.className = 'memory-store-msg-btn';
  button.textContent = '📌';
  button.title = 'Store this message';
  button.style.cssText = `
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    padding: 4px 8px;
    opacity: 0.5;
    transition: opacity 0.2s;
    margin-left: 8px;
  `;

  button.onmouseover = () => (button.style.opacity = '1');
  button.onmouseout = () => (button.style.opacity = '0.5');
  button.onclick = () => {
    const text = messageElement.textContent.trim();
    storeMemory(text, 'chat');
  };

  messageElement.appendChild(button);
}

function updateMemorySuggestions() {
  try {
    if (!chrome || !chrome.runtime) {
      return; // Extension context lost, silently return
    }
    
    const messages = document.querySelectorAll('[data-message-id]');
    if (messages.length === 0) return;

    // Get last user message as search query
    let lastMessage = '';
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i].textContent.trim();
      if (msg.length > 20 && msg.length < 300) {
        lastMessage = msg;
        break;
      }
    }

    if (lastMessage) {
      searchMemories(lastMessage);
    }
  } catch (error) {
    // Silently ignore errors during memory suggestions
    if (error && error.message && !error.message.includes('closed')) {
      console.debug('Memory suggestion error:', error.message);
    }
  }
}

async function searchMemories(query) {
  try {
    // Check context before attempting to send message
    if (!chrome || !chrome.runtime) {
      console.warn('Extension context invalidated');
      return;
    }
    
    const startTime = Date.now();
    console.log('🔍 Searching memories for query:', query.substring(0, 50) + '...');
    
    // Create promise with longer timeout (20 seconds for daemon response)
    const response = await Promise.race([
      new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage({
            type: 'RECALL_MEMORIES',
            data: { text: query, limit: 5 },
          }, (response) => {
            try {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else if (response) {
                const elapsed = Date.now() - startTime;
                console.log(`✅ Memory search completed in ${elapsed}ms`);
                resolve(response);
              } else {
                reject(new Error('No response received'));
              }
            } catch (callbackError) {
              console.error('Error in callback:', callbackError);
              reject(callbackError);
            }
          });
        } catch (sendError) {
          reject(sendError);
        }
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Memory search timeout (20s) - daemon may be busy or unresponsive')), 20000)
      )
    ]);

    if (response && response.success && response.data?.memories?.length > 0) {
      displayMemoriesSidebar(response.data.memories);
    } else {
      const content = document.getElementById('memory-content');
      if (content) {
        content.innerHTML = '<div style="padding: 12px; color: #999; font-size: 12px;">No relevant memories</div>';
      }
    }
  } catch (error) {
    // Silently ignore certain errors to prevent console spam
    if (!error) {
      return; // Ignore empty errors
    }
    
    if (error.message && error.message.includes('context')) {
      console.warn('Extension context lost - may have been reloaded');
    } else if (error.message && error.message.includes('timeout')) {
      console.warn('Memory search timeout - daemon may be busy');
    } else if (error.message && (error.message.includes('extension') || error.message.includes('Extension'))) {
      console.warn('Extension error during memory search');
    } else {
      console.error('Failed to search memories:', error.message || error);
    }
  }
}

function displayMemoriesSidebar(memories) {
  const content = document.getElementById('memory-content');
  if (!content) return;

  content.innerHTML = '';

  memories.forEach((memory) => {
    // Handle both old format (text, metadata) and new format (content, metadata)
    const memText = memory.text || memory.content || '';
    const memMetadata = memory.metadata || {};
    
    if (!memText) return; // Skip if no content
    
    const item = document.createElement('div');
    item.style.cssText = `
      padding: 12px;
      border: 1px solid #e5e5e5;
      border-radius: 6px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: all 0.2s;
      background: white;
    `;

    item.onmouseover = () => {
      item.style.background = '#f5f5f5';
      item.style.borderColor = '#667eea';
    };

    item.onmouseout = () => {
      item.style.background = 'white';
      item.style.borderColor = '#e5e5e5';
    };

    // Store memory text as data attribute
    item.setAttribute('data-memory-text', memText);
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = item.getAttribute('data-memory-text');
      if (text) {
        insertMemoryIntoChat(text);
      }
    });

    const text = document.createElement('div');
    text.style.cssText = `
      font-size: 12px;
      color: #333;
      margin-bottom: 6px;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    `;
    text.textContent = memText;

    const meta = document.createElement('div');
    meta.style.cssText = `
      font-size: 10px;
      color: #999;
    `;
    meta.textContent = `${memMetadata.source_app || 'unknown'} • ${formatDate(memMetadata.timestamp)}`;

    item.appendChild(text);
    item.appendChild(meta);
    content.appendChild(item);
  });
}

function insertMemoryIntoChat(text) {
  try {
    // Validate text exists
    if (!text || typeof text !== 'string') {
      console.error('❌ Invalid memory text:', text);
      showNotification('❌ Invalid memory content');
      return;
    }
    
    // Try multiple selectors for different ChatGPT UI versions
    let input = document.querySelector('textarea[placeholder*="message"]')
      || document.querySelector('textarea[placeholder*="Message"]')
      || document.querySelector('textarea')
      || document.querySelector('[contenteditable="true"][role="textbox"]')
      || document.querySelector('[data-testid="send-button"]')?.closest('form')?.querySelector('textarea');

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

async function storeMemory(text, contextType = 'chat') {
  if (!text || text.length < 10) return;

  try {
    // Check extension context before starting
    if (!chrome || !chrome.runtime) {
      console.warn('Extension context invalidated');
      showNotification('Extension context lost - please reload the page', 'error');
      return;
    }
    
    const memoryData = {
      text,
      source_app: 'chatgpt',
      tags: ['chatgpt', contextType],
    };
    
    console.log('📤 Sending memory data to service worker:', {
      text_length: memoryData.text.length,
      source_app: memoryData.source_app,
      tags: memoryData.tags
    });
    
    // Store reference to sendMessage before async call
    const sendMsg = chrome.runtime.sendMessage;
    
    sendMsg({
      type: 'STORE_MEMORY',
      data: memoryData,
    }, (response) => {
      try {
        // Check if extension context still available in callback
        if (!chrome || !chrome.runtime || !response) {
          console.error('❌ Extension context lost during callback');
          showNotification('Extension context lost - please reload the page', 'error');
          return;
        }

        console.log('📨 Service worker response:', response);

        // Check for runtime errors
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message || 'Unknown error';
          console.warn('Extension context invalidated:', errorMsg);
          showNotification('Extension error - please reload', 'error');
          return;
        }

        if (response.success) {
          console.log('✅ Memory stored successfully:', response.data);
          showNotification('✅ Saved to memory!');
        } else if (response.error) {
          console.error('❌ Daemon returned error:', response.error);
          showNotification(`❌ Failed: ${response.error}`, 'error');
        } else {
          console.error('❌ Unknown response format:', response);
          showNotification('❌ Failed to save (no response)', 'error');
        }
      } catch (e) {
        console.error('❌ Error processing response:', e);
        showNotification(`❌ Error: ${e.message}`, 'error');
      }
    });
  } catch (error) {
    console.error('Failed to store memory:', error.message, error);
    showNotification(`❌ Error: ${error.message || 'Unknown error'}`, 'error');
  }
}

function storeCurrentConversation() {
  const messages = document.querySelectorAll('[data-message-id]');
  if (messages.length === 0) {
    showNotification('No messages to store', 'warning');
    return;
  }

  const allText = Array.from(messages)
    .map((msg) => msg.textContent.trim())
    .filter((text) => text.length > 0)
    .join('\n\n---\n\n');

  storeMemory(allText, 'chat');
}

function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    padding: 12px 20px;
    background-color: ${type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#10b981'};
    color: white;
    border-radius: 6px;
    font-size: 13px;
    z-index: 99999;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  `;

  if (document.body) {
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2000);
  }
}

function formatDate(timestamp) {
  if (!timestamp) return 'unknown';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

console.log('✅ ChatGPT Memory Mesh integration loaded');