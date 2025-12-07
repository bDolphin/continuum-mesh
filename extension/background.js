/**
 * Background Service Worker
 * Handles communication between content scripts and local daemon
 */

const DAEMON_URL = 'http://localhost:8000';

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'STORE_MEMORY') {
    storeMemory(message.data)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'CHECK_DAEMON') {
    checkDaemonHealth()
      .then(isHealthy => sendResponse({ success: true, isHealthy }))
      .catch(() => sendResponse({ success: false, isHealthy: false }));
    return true;
  }
});

async function storeMemory(memoryData) {
  try {
    const response = await fetch(`${DAEMON_URL}/store`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(memoryData)
    });
    
    if (!response.ok) {
      throw new Error(`Daemon error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to store memory:', error);
    throw error;
  }
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

chrome.runtime.onInstalled.addListener((details) => {
  console.log('Context Mesh extension installed:', details.reason);
  checkDaemonHealth().then(isHealthy => {
    if (!isHealthy) {
      console.warn('Local daemon not running. Please start the daemon at localhost:8000');
    }
  });
});