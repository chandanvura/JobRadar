/**
 * IndexedDB and local storage cache for JobRadar catalog.
 * Provides instant cold launch (<30ms) by hydrating from client-side persistent storage
 * before background network revalidation completes.
 */

const DB_NAME = 'jobradar-catalog-cache';
const DB_VERSION = 1;
const STORE_NAME = 'catalog-store';
const CATALOG_KEY = 'latest-catalog';
const FALLBACK_STORAGE_KEY = 'jobradar-cached-catalog-v1';

export type CachedCatalogPayload = {
  jobs: unknown[];
  companies: unknown[];
  catalog_ranges?: unknown[];
  latest_run?: unknown;
  runs?: unknown[];
  notifications?: unknown[];
  policy?: unknown;
  configured?: boolean;
  server_time?: string;
  data_mode?: string;
  cached_at?: number;
};

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Loads the locally cached catalog from IndexedDB, falling back to localStorage if IndexedDB is unavailable.
 * Resolves within a few milliseconds, enabling instant UI cold launch (<30ms).
 */
export async function getLocalCachedCatalog<T extends CachedCatalogPayload>(): Promise<T | null> {
  try {
    const db = await openDatabase();
    if (db) {
      const fromIdb = await new Promise<T | null>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(CATALOG_KEY);
          req.onsuccess = () => resolve((req.result as T) || null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
      if (fromIdb && Array.isArray(fromIdb.jobs) && fromIdb.jobs.length > 0) {
        return fromIdb;
      }
    }
  } catch {
    // Fall through to localStorage fallback
  }

  // Fallback to localStorage
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(FALLBACK_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as T;
        if (parsed && Array.isArray(parsed.jobs) && parsed.jobs.length > 0) {
          return parsed;
        }
      }
    }
  } catch {
    // Storage access restricted or disabled
  }

  return null;
}

/**
 * Persists the latest catalog payload to IndexedDB (and bounded subset to localStorage as fallback).
 */
export async function setLocalCachedCatalog<T extends CachedCatalogPayload>(catalog: T): Promise<void> {
  if (!catalog || !Array.isArray(catalog.jobs) || catalog.jobs.length === 0) return;

  const record = {
    ...catalog,
    cached_at: Date.now(),
  };

  try {
    const db = await openDatabase();
    if (db) {
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.put(record, CATALOG_KEY);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    }
  } catch {
    // IndexedDB failure tolerated
  }

  // Also maintain bounded snapshot in localStorage for browsers with strict IndexedDB policies
  try {
    if (typeof localStorage !== 'undefined') {
      // Store compact representation to not blow localStorage quota
      const compactSnapshot = {
        ...record,
        // Keep up to 300 jobs in localStorage snapshot to respect 5MB limit
        jobs: record.jobs.slice(0, 300),
      };
      localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(compactSnapshot));
    }
  } catch {
    // QuotaExceeded or disabled localStorage tolerated
  }
}
