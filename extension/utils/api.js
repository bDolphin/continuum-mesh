/**
 * API Client for Memory Daemon
 * Location: extension/utils/api.js
 */

const API_BASE = 'http://localhost:2789';

// Detect global scope (works in service workers and content scripts)
// Use var with check to avoid duplicate declaration when imported multiple times
if (typeof globalScope === 'undefined') {
  var globalScope = typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : {};
}

// Only declare if not already loaded
if (typeof globalScope.MemoryAPI === 'undefined') {
  class MemoryAPI {
    constructor(baseUrl = API_BASE) {
      this.baseUrl = baseUrl;
      this.isAvailable = false;
      this.checkAvailability();
    }

    async checkAvailability() {
      try {
        const response = await fetch(`${this.baseUrl}/`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        this.isAvailable = response.ok;
        return this.isAvailable;
      } catch (error) {
        console.warn('Memory daemon unavailable:', error);
        this.isAvailable = false;
        return false;
      }
    }

    async store(memoryData) {
      if (!this.isAvailable) {
        throw new Error('Memory daemon is not running. Start it with: uvicorn main:app --port 2789');
      }

      try {
        const response = await fetch(`${this.baseUrl}/store`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(memoryData),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || `HTTP ${response.status}`);
        }

        return await response.json();
      } catch (error) {
        console.error('Failed to store memory:', error);
        throw error;
      }
    }

    async recall(query, options = {}) {
      if (!this.isAvailable) {
        throw new Error('Memory daemon is not running');
      }

      const { limit = 5, sourceApp = null } = options;
      const params = new URLSearchParams({
        query,
        limit: limit.toString(),
      });

      if (sourceApp) {
        params.append('source_app', sourceApp);
      }

      try {
        const response = await fetch(`${this.baseUrl}/recall?${params}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
      } catch (error) {
        console.error('Failed to recall memories:', error);
        throw error;
      }
    }

    async getConfig() {
      try {
        const response = await fetch(`${this.baseUrl}/config`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
      } catch (error) {
        console.warn('Failed to get config:', error);
        return null;
      }
    }
  }

  // Assign to window when declaring
  if (typeof window !== 'undefined') {
    window.MemoryAPI = MemoryAPI;
  }
}
// Create instance (use existing one if available)
let memoryAPI;
if (typeof globalScope.MemoryAPI !== 'undefined') {
  memoryAPI = new globalScope.MemoryAPI();
}

// Make instance available globally
if (typeof memoryAPI !== 'undefined') {
  globalScope.memoryAPI = memoryAPI;
}
