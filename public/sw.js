/**
 * MerchTrader PWA Service Worker
 * Handles web share target: intercepts POST to /share-target, stores files in IndexedDB, redirects to /handle-share
 */
const DB_NAME = 'merchtrader-share';
const DB_VERSION = 1;
const STORE_NAME = 'pending-share';
const PENDING_KEY = 'web-share-files';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(handleShareTarget(event.request));
  }
});

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('media');
    const fileEntries = [];

    for (const file of files) {
      if (file && file instanceof File) {
        const blob = await file.arrayBuffer();
        fileEntries.push({
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          blob,
        });
      }
    }

    if (fileEntries.length > 0) {
      const db = await openDB();
      await putPendingShare(db, fileEntries);
      db.close();
    }
  } catch (err) {
    console.error('[SW] Share target error:', err);
  }

  return Response.redirect('/handle-share', 303);
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

function putPendingShare(db, files) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(files, PENDING_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
