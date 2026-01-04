/**
 * Main Content Script
 * Handles text selection, hotkeys, and memory capture on all pages
 * Location: extension/content/content-script.js
 */

let selectedText = '';

// Wait for DOM to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeContentScript);
} else {
  initializeContentScript();
}

function initializeContentScript() {
  // Inject styles into document head
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `;
  if (document.head) {
    document.head.appendChild(style);
  }

  // Listen for text selection
  document.addEventListener('mouseup', () => {
    selectedText = window.getSelection().toString().trim();
  });

  // Listen for keyboard shortcuts
  document.addEventListener('keydown', (event) => {
    // Ctrl+Shift+M (Windows/Linux) or Cmd+Shift+M (Mac)
    if (
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === 'm'
    ) {
      event.preventDefault();
      handleStoreMemory();
    }

    // Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
    if (
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === 'r'
    ) {
      event.preventDefault();
      handleRecallMemory();
    }
  });

  console.log('✅ Context Memory Mesh content script initialized');
}

function handleStoreMemory() {
  const text = selectedText || prompt('Enter text to save:');

  if (!text || text.length === 0) {
    showNotification('No text selected or entered', 'warning');
    return;
  }

  // Get context information
  const url = window.location.href;
  const pageTitle = document.title;
  const contextType = window.ContextDetector ? window.ContextDetector.detect(text, url) : 'web';
  const tags = window.ContextDetector ? window.ContextDetector.extractTags(text, url, contextType) : [];

  // Prepare memory data
  const memoryData = {
    text,
    source_app: 'chrome',
    context_type: contextType,
    url,
    title: pageTitle,
    tags,
  };

  // Send to background script for storage
  try {
    chrome.runtime.sendMessage(
      {
        type: 'STORE_MEMORY',
        data: memoryData,
      },
      (response) => {
        try {
          // Check if extension context still exists
          if (chrome.runtime.lastError) {
            console.warn('Extension context invalidated:', chrome.runtime.lastError);
            showNotification('Extension context lost - please reload', 'error');
            return;
          }
          
          if (!response) {
            console.error('No response from service worker');
            showNotification('Failed to save: No response from extension', 'error');
            return;
          }
          
          if (response.success) {
            showNotification('✅ Memory saved!', 'success');
          } else {
            showNotification(
              `❌ Failed to save: ${response.error || 'Unknown error'}`,
              'error'
            );
            console.error('Store error:', response.error);
          }
        } catch (e) {
          console.error('Error processing store response:', e);
          showNotification(`Failed to save: ${e.message}`, 'error');
        }
      }
    );
  } catch (e) {
    console.error('Failed to send store message:', e);
    showNotification(`Failed to send store request: ${e.message}`, 'error');
  }
}

function handleRecallMemory() {
  const query = selectedText || prompt('Enter search query:');

  if (!query || query.length === 0) {
    showNotification('No query entered', 'warning');
    return;
  }

  // Send recall request to background script
  try {
    chrome.runtime.sendMessage(
      {
        type: 'RECALL_MEMORIES',
        data: {
          text: query,
          limit: 10,
        },
      },
      (response) => {
        try {
          // Check if extension context still exists
          if (chrome.runtime.lastError) {
            console.warn('Extension context invalidated:', chrome.runtime.lastError);
            showNotification('Extension context lost - please reload', 'error');
            return;
          }
          
          if (!response) {
            console.error('No response received from service worker');
            showNotification('Failed to search memories: No response', 'error');
            return;
          }
          
          if (!response.success) {
            console.error('Recall failed:', response.error);
            showNotification(`Failed to search memories: ${response.error}`, 'error');
            return;
          }
          
          const memories = response.data && response.data.memories ? response.data.memories : [];
          if (memories.length > 0) {
            showMemoryResults(memories);
          } else {
            showNotification('No memories found', 'info');
          }
        } catch (e) {
          console.error('Error processing recall response:', e);
          showNotification(`Failed to search memories: ${e.message}`, 'error');
        }
      }
    );
  } catch (e) {
    console.warn('Failed to send message - extension may have been reloaded', e);
    showNotification('Failed to send search request', 'error');
  }
}

function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    background-color: ${getBackgroundColor(type)};
    color: white;
    border-radius: 6px;
    font-size: 14px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    z-index: 99999;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    animation: slideIn 0.3s ease-out;
  `;

  if (document.body) {
    document.body.appendChild(notification);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

function showMemoryResults(memories) {
  try {
    // Validate input
    if (!memories || !Array.isArray(memories)) {
      console.error('Invalid memories array:', memories);
      showNotification('Invalid memory data received', 'error');
      return;
    }

    // Create results panel
    const panel = document.createElement('div');
  panel.id = 'memory-results-panel';
  panel.style.cssText = `
    position: fixed;
    right: 20px;
    bottom: 20px;
    width: 350px;
    max-height: 500px;
    background: white;
    border-radius: 10px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 99998;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 16px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    font-weight: 600;
    font-size: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  header.innerHTML = `
    <span>Found ${memories.length} memories</span>
    <button id="close-panel" style="
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      font-size: 18px;
    ">×</button>
  `;

  // Content
  const content = document.createElement('div');
  content.style.cssText = `
    padding: 12px;
    max-height: 400px;
    overflow-y: auto;
  `;

  memories.slice(0, 5).forEach((memory, index) => {
    // Handle both old format (text, metadata) and new format (content, metadata)
    const memText = memory.text || memory.content || '';
    const memMetadata = memory.metadata || {};
    
    if (!memText) return; // Skip if no content
    
    const item = document.createElement('div');
    item.style.cssText = `
      padding: 12px;
      border-bottom: 1px solid #eee;
      cursor: pointer;
      transition: background 0.2s;
    `;
    item.onmouseenter = () => {
      item.style.background = '#f5f5f5';
    };
    item.onmouseleave = () => {
      item.style.background = 'transparent';
    };
    item.onclick = () => {
      insertMemoryText(memText);
      panel.remove();
    };

    const text = document.createElement('div');
    text.style.cssText = `
      font-size: 13px;
      color: #333;
      margin-bottom: 6px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;
    text.textContent = memText;

    const meta = document.createElement('div');
    meta.style.cssText = `
      font-size: 11px;
      color: #999;
      display: flex;
      justify-content: space-between;
    `;
    meta.innerHTML = `
      <span>${memMetadata.source_app || 'unknown'}</span>
      <span>${formatDate(memMetadata.timestamp)}</span>
    `;

    item.appendChild(text);
    item.appendChild(meta);
    content.appendChild(item);
  });

  // Close button handler
  const closeBtn = header.querySelector('#close-panel');
  closeBtn.onclick = () => panel.remove();

  panel.appendChild(header);
  panel.appendChild(content);
  if (document.body) {
    document.body.appendChild(panel);
  }
  } catch (e) {
    console.error('Error displaying memory results:', e);
    showNotification(`Failed to display memories: ${e.message}`, 'error');
  }
}

function insertMemoryText(text) {
  const activeElement = document.activeElement;

  if (
    activeElement &&
    (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')
  ) {
    // Insert into input/textarea
    const start = activeElement.selectionStart;
    const end = activeElement.selectionEnd;
    const before = activeElement.value.substring(0, start);
    const after = activeElement.value.substring(end);
    activeElement.value = before + text + after;
    activeElement.selectionStart = activeElement.selectionEnd = start + text.length;
    activeElement.focus();
    showNotification('✅ Memory inserted!', 'success');
  } else if (document.activeElement?.contentEditable === 'true') {
    // Insert into contenteditable
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);
    showNotification('✅ Memory inserted!', 'success');
  } else {
    // Copy to clipboard
    navigator.clipboard.writeText(text).then(() => {
      showNotification('✅ Memory copied to clipboard!', 'success');
    });
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

function getBackgroundColor(type) {
  const colors = {
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
  };
  return colors[type] || colors.info;
}
