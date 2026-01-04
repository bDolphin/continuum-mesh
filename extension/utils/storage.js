/**
 * Local Storage Manager
 * Handles extension-level storage and caching
 * Location: extension/utils/storage.js
 */

// Detect global scope (works in service workers and content scripts)
// Use var with check to avoid duplicate declaration when imported multiple times
if (typeof globalScope === 'undefined') {
  var globalScope = typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : {};
}

// Only declare if not already loaded (prevents duplicate declaration errors)
if (typeof globalScope.StorageManager === 'undefined') {
  class StorageManager {
    static KEYS = {
      HOTKEY: 'extension_hotkey',
      LAST_MEMORIES: 'last_memories',
      SETTINGS: 'extension_settings',
      DAEMON_STATUS: 'daemon_status',
    };

    static DEFAULT_HOTKEY = 'Ctrl-M'; // Ctrl+M on Windows/Linux, Cmd+M on Mac

    static async getSettings() {
      return new Promise((resolve) => {
        chrome.storage.local.get([this.KEYS.SETTINGS], (result) => {
          resolve(
            result[this.KEYS.SETTINGS] || {
              hotkey: this.DEFAULT_HOTKEY,
              enableChatGPTSidebar: true,
              enablePerplexityCapture: true,
              autoStore: false,
              daemonUrl: 'http://localhost:2789',
            }
          );
        });
      });
    }

    static async saveSettings(settings) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ [this.KEYS.SETTINGS]: settings }, () => {
          resolve(true);
        });
      });
    }

  static async getHotkey() {
    const settings = await this.getSettings();
    return settings.hotkey || this.DEFAULT_HOTKEY;
  }

  static async setHotkey(hotkey) {
    const settings = await this.getSettings();
    settings.hotkey = hotkey;
    return this.saveSettings(settings);
  }

  static async saveLastMemories(memories) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.KEYS.LAST_MEMORIES]: memories }, () => {
        resolve(true);
      });
    });
  }

  static async getLastMemories() {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.KEYS.LAST_MEMORIES], (result) => {
        resolve(result[this.KEYS.LAST_MEMORIES] || []);
      });
    });
  }

  static async saveDaemonStatus(status) {
    return new Promise((resolve) => {
      chrome.storage.local.set(
        { [this.KEYS.DAEMON_STATUS]: { ...status, timestamp: Date.now() } },
        () => {
          resolve(true);
        }
      );
    });
  }

  static async getDaemonStatus() {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.KEYS.DAEMON_STATUS], (result) => {
        resolve(result[this.KEYS.DAEMON_STATUS] || { isAvailable: false });
      });
    });
  }

  static async clearAll() {
    return new Promise((resolve) => {
      chrome.storage.local.clear(() => {
        resolve(true);
      });
    });
  }
}
// Assign to global scope
if (typeof globalScope.StorageManager === 'undefined') {
  globalScope.StorageManager = StorageManager;
}
} // Close the if(typeof globalScope.StorageManager === 'undefined')
