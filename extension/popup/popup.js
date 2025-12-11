/**
 * Extension Popup Script with Search
 */

const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const openDashboardBtn = document.getElementById('openDashboard');
const dashboardFooter = document.querySelector('.footer');
const statusDashboardPill = document.getElementById('statusDashboardPill');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const resultsContainer = document.getElementById('results');

const DAEMON_URL = 'http://localhost:2789';

/**
 * Check daemon status
 */
async function checkDaemonStatus() {
  try {
    const response = await fetch(`${DAEMON_URL}/`);
    if (response.ok) {
      updateStatus('online', 'Connected');
      searchBtn.disabled = false;
    } else {
      updateStatus('offline', 'Daemon offline');
      searchBtn.disabled = true;
    }
  } catch (error) {
    updateStatus('offline', 'Connection error');
    searchBtn.disabled = true;
  }
}

/**
 * Update UI status
 */
function updateStatus(state, text) {
  statusIndicator.className = `status-indicator ${state}`;
  statusText.textContent = text;
}

/**
 * Search memories
 */
async function searchMemories(query) {
  try {
    searchBtn.disabled = true;
    searchBtn.textContent = '...';
    
    const params = new URLSearchParams({
      query: query.trim() || '',  // Empty query to get all results
      n_results: '50'  // Get more results for client-side filtering
    });
    
    const response = await fetch(`${DAEMON_URL}/recall?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error('Search failed');
    }
    
    const data = await response.json();
    
    console.log('Context Mesh Popup: Raw results from daemon:', data.results?.length || 0);
    
    const backendResults = data.results || [];
    const trimmedQuery = query.trim().toLowerCase();

    // If query is empty, trust backend ordering (already newest-first)
    if (!trimmedQuery) {
      console.log('Context Mesh Popup: Empty query, using backend ordering');
      displayResults(backendResults);
      return;
    }

    // Client-side filtering for testing mode (case-insensitive)
    let results = backendResults;
    if (results.length > 0) {
      const searchTerm = trimmedQuery;
      const beforeFilter = results.length;
      
      console.log('Context Mesh Popup: Filtering for term:', searchTerm);
      console.log('Context Mesh Popup: Sample result:', results[0]);
      
      results = results.filter(r => {
        const content = (r.content || '').toLowerCase();
        const sourceApp = (r.metadata?.source_app || '').toLowerCase();
        const tags = (r.metadata?.tags || '').toLowerCase();
        
        const matches = content.includes(searchTerm) || 
                       sourceApp.includes(searchTerm) || 
                       tags.includes(searchTerm);
        
        if (matches) {
          console.log('Context Mesh Popup: Match found in:', r.content.substring(0, 50));
        }
        
        return matches;
      });
      
      console.log('Context Mesh Popup: Filtered', beforeFilter, 'to', results.length, 'results');
    }
    
    // Sort by timestamp (most recent first) for non-empty queries
    results.sort((a, b) => {
      const timeA = a.metadata?.timestamp ? new Date(a.metadata.timestamp).getTime() : 0;
      const timeB = b.metadata?.timestamp ? new Date(b.metadata.timestamp).getTime() : 0;
      return timeB - timeA;
    });
    
    console.log('Context Mesh Popup: Displaying', results.length, 'sorted results');
    displayResults(results);
  } catch (error) {
    console.error('Context Mesh Popup: Search error:', error);
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <div>Search failed: ${error.message}</div>
        <div style="font-size: 11px; margin-top: 8px; opacity: 0.7;">Check console for details</div>
      </div>
    `;
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = 'Search';
  }
}

/**
 * Display search results
 */
function toggleDashboardPill(show) {
  if (!statusDashboardPill) return;
  if (show) {
    statusDashboardPill.classList.remove('status-pill-hidden');
    statusDashboardPill.setAttribute('aria-hidden', 'false');
    dashboardFooter?.classList.add('footer-hidden');
  } else {
    statusDashboardPill.classList.add('status-pill-hidden');
    statusDashboardPill.setAttribute('aria-hidden', 'true');
    dashboardFooter?.classList.remove('footer-hidden');
  }
}

function displayResults(results) {
  if (results.length === 0) {
    toggleDashboardPill(false);
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div>No memories found</div>
      </div>
    `;
    return;
  }
  toggleDashboardPill(true);
  resultsContainer.innerHTML = results.map(result => {
    const timestamp = result.metadata?.timestamp 
      ? new Date(result.metadata.timestamp).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })
      : '';
    
    const sourceApp = result.metadata?.source_app || 'unknown';
    
    return `
      <div class="result-card" data-content="${escapeHtml(result.content)}">
        <div class="result-meta">
          ${sourceApp ? `<span class="badge">${escapeHtml(sourceApp)}</span>` : ''}
          ${timestamp ? `<span class="badge">🕐 ${timestamp}</span>` : ''}
        </div>
        <div class="result-content">${escapeHtml(result.content)}</div>
      </div>
    `;
  }).join('');
  
  // Add click handlers to copy content
  document.querySelectorAll('.result-card').forEach(card => {
    card.addEventListener('click', () => {
      const content = card.getAttribute('data-content');
      copyToClipboard(content);
    });
  });
}

/**
 * Copy to clipboard and show toast
 */
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showCopiedToast();
  }).catch(err => {
    console.error('Failed to copy:', err);
  });
}

/**
 * Show copied toast notification
 */
function showCopiedToast() {
  const toast = document.createElement('div');
  toast.className = 'copied-toast';
  toast.textContent = '✓ Copied!';
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 2000);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Open dashboard in new tab
 */
openDashboardBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'http://localhost:3000' });
});

statusDashboardPill?.addEventListener('click', () => {
  chrome.tabs.create({ url: 'http://localhost:3000' });
});

/**
 * Search on button click
 */
searchBtn.addEventListener('click', () => {
  const query = searchInput.value;
  searchMemories(query);
});

/**
 * Search on Enter key
 */
searchInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const query = searchInput.value;
    searchMemories(query);
  }
});

// Check status on popup open
checkDaemonStatus();

// Show welcome message with particles initially
resultsContainer.innerHTML = `
  <div class="empty-state">
    <div class="particles-container">
      <div class="particle"></div>
      <div class="particle"></div>
      <div class="particle"></div>
      <div class="particle"></div>
      <div class="particle"></div>
      <div class="particle"></div>
      <div class="particle"></div>
      <div class="particle"></div>
    </div>
    <div class="empty-icon">🧠</div>
    <div class="welcome-text">
      <div style="font-size: 18px; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.3px;">Context Mesh</div>
      <div style="font-size: 13px; opacity: 0.9; margin-bottom: 4px;">Your personal memory assistant</div>
      <div class="typing-animation" style="font-size: 12px; opacity: 0.7; margin-top: 16px; height: 20px;">
        <span class="typing-text"></span>
        <span class="cursor">|</span>
      </div>
    </div>
  </div>
`;

// Add typing animation
const typingText = resultsContainer.querySelector('.typing-text');
const messages = [
  'Type to search your memories...',
  'Find conversations instantly...',
  'Search across all your chats...',
  'Recall anything you\'ve saved...'
];
let messageIndex = 0;
let charIndex = 0;
let isDeleting = false;

function typeAnimation() {
  if (!typingText) return;
  
  const currentMessage = messages[messageIndex];
  
  if (!isDeleting) {
    typingText.textContent = currentMessage.substring(0, charIndex + 1);
    charIndex++;
    
    if (charIndex === currentMessage.length) {
      setTimeout(() => { isDeleting = true; }, 2000);
      setTimeout(typeAnimation, 2000);
      return;
    }
  } else {
    typingText.textContent = currentMessage.substring(0, charIndex - 1);
    charIndex--;
    
    if (charIndex === 0) {
      isDeleting = false;
      messageIndex = (messageIndex + 1) % messages.length;
    }
  }
  
  setTimeout(typeAnimation, isDeleting ? 30 : 80);
}

// Start typing animation
setTimeout(typeAnimation, 500);