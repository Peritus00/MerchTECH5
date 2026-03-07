/**
 * Web Share Target - read pending shared files from IndexedDB (stored by service worker)
 * Used by handle-share screen on web when opened via PWA share target
 */

const DB_NAME = 'merchtrader-share';
const DB_VERSION = 1;
const STORE_NAME = 'pending-share';
const PENDING_KEY = 'web-share-files';

export interface PendingWebShareFile {
  name: string;
  type: string;
  size: number;
  blob: ArrayBuffer;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function getPendingWebShare(): Promise<File[]> {
  const db = await openDB();
  try {
    const entries = await new Promise<PendingWebShareFile[] | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(PENDING_KEY);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
    db.close();

    if (!entries || entries.length === 0) {
      return [];
    }

    const files = entries.map(
      (e) => new File([e.blob], e.name, { type: e.type })
    );
    return files;
  } catch {
    db.close();
    return [];
  }
}

export async function clearPendingWebShare(): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(PENDING_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function hasPendingWebShareStorage(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** Resume-after-login: set when redirecting to login from handle-share so we return to handle-share after auth */
const PENDING_SHARE_RESUME_KEY = 'merchtrader_pending_share_resume';

export function setPendingShareResume(): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(PENDING_SHARE_RESUME_KEY, '1');
  }
}

export function hasPendingShareResume(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem(PENDING_SHARE_RESUME_KEY) === '1';
}

export function clearPendingShareResume(): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(PENDING_SHARE_RESUME_KEY);
  }
}
