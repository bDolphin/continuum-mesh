/**
 * ChatGPT Content Script
 */

console.log('Context Mesh: ChatGPT content script loaded');

const processedMessagesChatGPT = new Set();

function extractConversationChatGPT() {
  const messages = document.querySelectorAll('[data-message-author-role]');
  
  messages.forEach((messageEl) => {
    const role = messageEl.getAttribute('data-message-author-role');
    const messageId = messageEl.getAttribute('data-message-id');
    
    if (!messageId || processedMessagesChatGPT.has(messageId)) {
      return;
    }
    
    const contentEl = messageEl.querySelector('.markdown, [class*="markdown"]') || 
                      messageEl.querySelector('[data-message-id] > div > div');
    
    if (!contentEl) {
      return;
    }
    
    const text = contentEl.textContent.trim();
    
    if (text.length < 10) {
      return;
    }
    
    const messageType = role === 'user' ? 'query' : role === 'assistant' ? 'response' : 'system';
    const conversationId = extractConversationIdChatGPT();
    
    storeInMemoryChatGPT({
      text: text,
      source_app: 'chatgpt',
      url: window.location.href,
      conversation_id: conversationId,
      message_type: messageType,
      tags: ['chatgpt', messageType]
    });
    
    processedMessagesChatGPT.add(messageId);
  });
}

function extractConversationIdChatGPT() {
  const urlPath = window.location.pathname;
  const match = urlPath.match(/\/c\/([^\/]+)/);
  return match ? match[1] : 'chatgpt-' + Date.now();
}

function storeInMemoryChatGPT(memoryData) {
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

function observeConversationChatGPT() {
  const observer = new MutationObserver((mutations) => {
    clearTimeout(window.contextMeshDebounceChatGPT);
    window.contextMeshDebounceChatGPT = setTimeout(() => {
      extractConversationChatGPT();
    }, 1000);
  });
  
  const mainContent = document.querySelector('main') || document.body;
  
  observer.observe(mainContent, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-message-id']
  });
  
  console.log('Context Mesh: Observing ChatGPT conversations');
}

function handleNavigationChatGPT() {
  let lastUrl = window.location.href;
  
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      processedMessagesChatGPT.clear();
      
      setTimeout(() => {
        extractConversationChatGPT();
      }, 1500);
    }
  }, 1000);
}

function initChatGPT() {
  const waitForChatGPT = setInterval(() => {
    const hasMessages = document.querySelector('[data-message-author-role]');
    if (hasMessages) {
      clearInterval(waitForChatGPT);
      extractConversationChatGPT();
      observeConversationChatGPT();
      handleNavigationChatGPT();
    }
  }, 1000);
  
  setTimeout(() => {
    clearInterval(waitForChatGPT);
    observeConversationChatGPT();
    handleNavigationChatGPT();
  }, 10000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initChatGPT);
} else {
  initChatGPT();
}