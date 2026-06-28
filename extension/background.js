/**
 * Background Service Worker
 * Handles communication between content scripts and local daemon
 * Location: extension/background.js
 */

// Import utility modules for service worker
try {
  importScripts('utils/storage.js', 'utils/api.js', 'utils/detector.js');
} catch (error) {
  console.error('Failed to import utility scripts:', error);
}

const DAEMON_URL = 'http://localhost:2789';
// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'STORE_MEMORY') {
    console.log('📥 Service worker received STORE_MEMORY:', {
      text_length: message.data?.text?.length,
      source_app: message.data?.source_app,
      has_data: !!message.data
    });
    
    (async () => {
      try {
        const response = await storeMemory(message.data);
        console.log('✅ storeMemory returned:', { success: true, memory_id: response.memory_id });
        
        // Update last memories cache
        if (typeof StorageManager !== 'undefined' && StorageManager.getLastMemories) {
          try {
            const memories = await StorageManager.getLastMemories();
            memories.unshift({
              ...message.data,
              id: response.memory_id,  // Use memory_id from daemon response
              timestamp: new Date().toISOString(),
            });
            await StorageManager.saveLastMemories(memories.slice(0, 10)); // Keep last 10
            console.log('📦 Cache updated with new memory');
          } catch (cacheError) {
            console.warn('Failed to update memory cache:', cacheError);
            // Don't fail the store operation if cache update fails
          }
        }
        
        console.log('📤 Sending response to content script:', { success: true, data: response });
        if (sendResponse) {
          sendResponse({ success: true, data: response });
        }
      } catch (error) {
        console.error('❌ Store error in service worker:', error.message, error);
        if (sendResponse) {
          sendResponse({ success: false, error: error.message });
        }
      }
    })();
    return true; // Keep channel open for async response
  }

  else if (message.type === 'RECALL_MEMORIES') {
    // Extract query from message.data or message.query (handle both formats)
    const query = message.data?.text || message.query;
    const limit = message.data?.limit || message.n_results || 5;
    
    console.log('📥 Service worker received RECALL_MEMORIES:', {
      query: query,
      limit: limit
    });
    
    // Validate query exists synchronously
    if (!query || typeof query !== 'string') {
      console.error('❌ Invalid query:', query);
      sendResponse({ success: false, error: 'Query must be a non-empty string' });
      return true;
    }
    
    (async () => {
      try {
        const response = await recallMemories(query, limit);
        console.log('✅ recallMemories returned:', { 
          success: true, 
          memories_count: response.memories?.length || 0 
        });
        
        console.log('📤 Sending recall response to content script');
        if (sendResponse) {
          sendResponse({ success: true, data: response });
        }
      } catch (error) {
        console.error('❌ Recall error in service worker:', error.message, error);
        if (sendResponse) {
          sendResponse({ success: false, error: error.message });
        }
      }
    })();
    return true;
  }

  else if (message.type === 'ASSEMBLE_CONTEXT') {
    const query = message.data?.query;
    const tokenBudget = message.data?.token_budget || 600;

    if (!query || typeof query !== 'string' || !query.trim()) {
      sendResponse({ success: false, error: 'Query must be a non-empty string' });
      return true;
    }

    (async () => {
      try {
        const data = await assembleContext(query, tokenBudget);
        sendResponse({ success: true, data });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  else if (message.type === 'FEEDBACK') {
    const recallId = message.data?.recall_id;
    const memoryId = message.data?.memory_id;
    if (!recallId || !memoryId) {
      sendResponse({ success: false, error: 'recall_id and memory_id required' });
      return true;
    }
    (async () => {
      try {
        const data = await sendFeedback(recallId, memoryId);
        sendResponse({ success: true, data });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === 'CHECK_DAEMON') {
    checkDaemonHealth()
      .then(isHealthy => {
        sendResponse({ success: true, isHealthy });
        if (typeof StorageManager !== 'undefined' && StorageManager.saveDaemonStatus) {
          StorageManager.saveDaemonStatus({ isAvailable: isHealthy });
        }
      })
      .catch(() => {
        sendResponse({ success: false, isHealthy: false });
        if (typeof StorageManager !== 'undefined' && StorageManager.saveDaemonStatus) {
          StorageManager.saveDaemonStatus({ isAvailable: false });
        }
      });
    return true;
  }

  if (message.type === 'GET_LAST_MEMORIES') {
    if (typeof StorageManager !== 'undefined' && StorageManager.getLastMemories) {
      StorageManager.getLastMemories().then(memories => {
        sendResponse({ success: true, data: memories });
      });
    } else {
      sendResponse({ success: false, error: 'StorageManager not available' });
    }
    return true;
  }
});

async function storeMemory(memoryData) {
  try {
    // Validate required fields
    if (!memoryData.text || typeof memoryData.text !== 'string') {
      throw new Error('Missing required field: text must be a non-empty string');
    }
    if (!memoryData.source_app || typeof memoryData.source_app !== 'string') {
      throw new Error('Missing required field: source_app must be a non-empty string');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(`${DAEMON_URL}/store`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(memoryData),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Try to get error details from response
      let errorDetail = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        if (typeof errorData === 'object') {
          if (errorData.detail) {
            errorDetail = String(errorData.detail);
          } else if (errorData.message) {
            errorDetail = String(errorData.message);
          } else {
            errorDetail = JSON.stringify(errorData);
          }
        } else if (errorData) {
          errorDetail = String(errorData);
        }
      } catch (parseErr) {
        // Couldn't parse error response, use status only
        console.warn('Could not parse error response:', parseErr);
      }
      throw new Error(`Daemon error: ${errorDetail}`);
    }

    const responseData = await response.json();
    if (!responseData.success) {
      throw new Error(`Daemon error: ${responseData.message || 'Unknown error'}`);
    }
    
    return responseData;
  } catch (error) {
    console.error('Failed to store memory:', error);
    throw error;
  }
}

async function recallMemories(query, limit = 5) {
  try {
    // Ensure query is a string
    if (!query || typeof query !== 'string') {
      throw new Error('Query must be a non-empty string');
    }
    
    const params = new URLSearchParams({
      query: query,
      n_results: limit,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(`${DAEMON_URL}/recall?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        if (typeof errorData === 'object') {
          if (errorData.detail) {
            errorDetail = String(errorData.detail);
          } else if (errorData.message) {
            errorDetail = String(errorData.message);
          } else {
            errorDetail = JSON.stringify(errorData);
          }
        } else if (errorData) {
          errorDetail = String(errorData);
        }
      } catch (parseErr) {
        console.warn('Could not parse error response:', parseErr);
      }
      throw new Error(`Daemon error: ${errorDetail}`);
    }

    const responseData = await response.json();
    return responseData;
  } catch (error) {
    console.error('Failed to recall memories:', error);
    throw error;
  }
}

async function assembleContext(query, tokenBudget) {
  const params = new URLSearchParams({
    query,
    token_budget: String(tokenBudget),
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${DAEMON_URL}/assemble?${params}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        if (errBody?.detail) detail = String(errBody.detail);
      } catch (_) { /* keep status */ }
      throw new Error(`Daemon error: ${detail}`);
    }
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function sendFeedback(recallId, memoryId) {
  const response = await fetch(`${DAEMON_URL}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recall_id: recallId, memory_id: memoryId }),
  });
  if (!response.ok) throw new Error(`Feedback failed: HTTP ${response.status}`);
  return await response.json();
}

async function checkDaemonHealth() {
  try {
    const response = await fetch(`${DAEMON_URL}/`, {
      method: 'GET',
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

// Initialize on install/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Context Mesh extension', details.reason);

  // Check daemon on startup
  checkDaemonHealth().then(isHealthy => {
    if (typeof StorageManager !== 'undefined' && StorageManager.saveDaemonStatus) {
      StorageManager.saveDaemonStatus({ isAvailable: isHealthy });
    }
    if (!isHealthy) {
      console.warn('⚠️ Local daemon not running. Start it with: uvicorn main:app --port 2789');
    } else {
      console.log('✅ Daemon connection established');
    }
  });

  // Set up context menus
  setupContextMenus();
});

function setupContextMenus() {
  // Clear existing menus
  chrome.contextMenus.removeAll();

  // Store selected text menu item
  chrome.contextMenus.create({
    id: 'store-memory',
    title: 'Store to Memory Mesh',
    contexts: ['selection'],
  });

  // Recall memories menu item
  chrome.contextMenus.create({
    id: 'recall-memory',
    title: 'Search Memory Mesh',
    contexts: ['page'],
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'store-memory') {
    // Send store request to content script
    chrome.tabs.sendMessage(
      tab.id,
      {
        type: 'CAPTURE_SELECTION',
        selectedText: info.selectionText,
      },
      (response) => {
        if (!response || !response.success) {
          console.error('Failed to capture selection');
        }
      }
    );
  }

  if (info.menuItemId === 'recall-memory') {
    // Open recall panel
    chrome.tabs.sendMessage(
      tab.id,
      {
        type: 'OPEN_RECALL_PANEL',
      },
      () => {
        // Silently handle response
      }
    );
  }
});

// Set up periodic health check using alarms API (Manifest v3 compatible)
chrome.alarms.create('daemonHealthCheck', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'daemonHealthCheck') {
    checkDaemonHealth().then(isHealthy => {
      if (typeof StorageManager !== 'undefined' && StorageManager.saveDaemonStatus) {
        StorageManager.saveDaemonStatus({ isAvailable: isHealthy });
      }
    });
  }
});