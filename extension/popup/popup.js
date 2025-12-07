/**
 * Extension Popup Script
 */

const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const openDashboardBtn = document.getElementById('openDashboard');
const testConnectionLink = document.getElementById('testConnection');

/**
 * Check daemon status
 */
async function checkDaemonStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_DAEMON' });
    
    if (response.success && response.isHealthy) {
      updateStatus('online', 'Daemon is running');
      openDashboardBtn.disabled = false;
    } else {
      updateStatus('offline', 'Daemon is offline');
      openDashboardBtn.disabled = true;
    }
  } catch (error) {
    updateStatus('offline', 'Connection error');
    openDashboardBtn.disabled = true;
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
 * Open dashboard in new tab
 */
openDashboardBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'http://localhost:8000/memories' });
});

/**
 * Test connection
 */
testConnectionLink.addEventListener('click', (e) => {
  e.preventDefault();
  statusText.textContent = 'Testing...';
  checkDaemonStatus();
});

// Check status on popup open
checkDaemonStatus();

// Recheck every 5 seconds while popup is open
setInterval(checkDaemonStatus, 5000);