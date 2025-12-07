/**
 * Perplexity.ai Content Script
 */

console.log('Context Mesh: Perplexity content script loaded');

const processedMessages = new Set();

function extractConversation() {
  const messages = document.querySelectorAll('[class*="Markdown"]');
  
  messages.forEach((messageEl, index) => {
    const messageId = `perplexity-${index}-${messageEl.textContent.substring(0, 50)}`;
    
    if (processedMessages.has(messageId)) {
      return;
    }
    
    const text = messageEl.textContent.trim();
    
    if (text.length < 10) {
      return;
    }
    
    const isQuery = messageEl.closest('[class*="UserMessage"]') !== null;
    const isResponse = messageEl.closest('[class*="AssistantMessage"]') !== null;
    const messageType = isQuery ? 'query' : isResponse ? 'response' : 'unknown';
    const conversationId = extractConversationId();
    
    storeInMemory({
      text: text,
      source_app: 'perplexity',
      url: window.location.href,
      conversation_id: conversationId,
      message_type: messageType,
      tags: ['perplexity', messageType]
    });
    
    processedMessages.add(messageId);
  });
}

function extractConversationId() {
  const urlPath = window.location.pathname;
  const match = urlPath.match(/\/search\/([^\/]+)/);
  return match ? match[1] : 'perplexity-' + Date.now();
}

function storeInMemory(memoryData) {
  chrome.runtime.sendMessage(
    {
      type: 'STORE_MEMORY',
      data: memoryData
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('Context Mesh error:', chrome.runtime.lastError);
        return;
      }
      
      if (response && response.success) {
        console.log('Context Mesh: Memory stored', response.data);
      } else {
        console.error('Context Mesh: Failed to store memory', response?.error);
      }
    }
  );
}

function observeConversation() {
  const observer = new MutationObserver((mutations) => {
    clearTimeout(window.contextMeshDebounce);
    window.contextMeshDebounce = setTimeout(() => {
      extractConversation();
    }, 1000);
  });
  
  const mainContent = document.querySelector('main') || document.body;
  
  observer.observe(mainContent, {
    childList: true,
    subtree: true
  });
  
  console.log('Context Mesh: Observing Perplexity conversations');
}

function init() {
  extractConversation();
  observeConversation();
  
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      processedMessages.clear();
      extractConversation();
    }
  }, 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}