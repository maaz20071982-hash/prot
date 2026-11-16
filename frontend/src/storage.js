/**
 * THERMOSENSE Safe Storage Abstraction (storage.js)
 * ------------------------------------------------
 * Robust wrapper around localStorage and sessionStorage.
 * Prevents fatal DOMException / SecurityError crashes when storage is:
 * 1. Disabled or partitioned in In-App WebViews (WhatsApp, Telegram, Instagram, Gmail)
 * 2. Blocked in Safari / Chrome Private Browsing / Incognito modes
 * 3. Restricted in sandboxed iframes or cross-origin link clicks
 * Automatically falls back to an in-memory dictionary.
 */

const memoryStore = new Map();

function testStorageAvailability() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    const testKey = '__ts_storage_probe__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch (err) {
    return false;
  }
}

const isStorageSupported = testStorageAvailability();

export const safeStorage = {
  isAvailable() {
    return isStorageSupported;
  },

  getItem(key) {
    if (isStorageSupported) {
      try {
        return window.localStorage.getItem(key);
      } catch (e) {
        // Fall back to memory
      }
    }
    return memoryStore.has(key) ? memoryStore.get(key) : null;
  },

  setItem(key, value) {
    const stringVal = String(value);
    if (isStorageSupported) {
      try {
        window.localStorage.setItem(key, stringVal);
        return;
      } catch (e) {
        // Fall back to memory on QuotaExceededError or security block
      }
    }
    memoryStore.set(key, stringVal);
  },

  removeItem(key) {
    if (isStorageSupported) {
      try {
        window.localStorage.removeItem(key);
      } catch (e) {}
    }
    memoryStore.delete(key);
  },

  clear() {
    if (isStorageSupported) {
      try {
        window.localStorage.clear();
      } catch (e) {}
    }
    memoryStore.clear();
  }
};
