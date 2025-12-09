/**
 * Perplexity.ai Content Script
 */

console.log('Context Mesh: Perplexity content script loaded');

const processedMessages = new Set();

function extractConversation() {
  // Try multiple selectors to find messages - updated for current Perplexity structure
  const selectors = [
    'div[class*="prose"]',
    'div[class*="markdown"]',
    'div[class*="Markdown"]',
    'div[class*="Message"]',
    '[role="article"]',
    'div[class*="answer"]',
    'div[class*="query"]'
  ];
  
  let allMessages = [];
  selectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    allMessages = [...allMessages, ...Array.from(elements)];
  });
  
  // Remove duplicates
  const uniqueMessages = [...new Set(allMessages)];
  
  console.log('Context Mesh: Found', uniqueMessages.length, 'potential message elements');
  console.log('Context Mesh: Selectors tried:', selectors.join(', '));
  
  if (uniqueMessages.length === 0) {
    console.warn('Context Mesh: No messages found. Page structure may have changed.');
    console.log('Context Mesh: Current URL:', window.location.href);
  }
  
  uniqueMessages.forEach((messageEl, index) => {
    const text = messageEl.textContent.trim();
    
    if (text.length < 10) {
      return;
    }
    
    const messageId = `perplexity-${index}-${text.substring(0, 50)}`;
    
    if (processedMessages.has(messageId)) {
      return;
    }
    
    const isQuery = messageEl.closest('[class*="UserMessage"]') !== null || 
                    messageEl.closest('[class*="user"]') !== null;
    const isResponse = messageEl.closest('[class*="AssistantMessage"]') !== null || 
                       messageEl.closest('[class*="assistant"]') !== null ||
                       messageEl.closest('[class*="answer"]') !== null;
    const messageType = isQuery ? 'query' : isResponse ? 'response' : 'content';
    const conversationId = extractConversationId();
    
    console.log('Context Mesh: Storing message:', {
      type: messageType,
      length: text.length,
      preview: text.substring(0, 50) + '...'
    });
    
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