// Minimal IndexedDB helper. Stores: "files" (audio blobs + metadata, keyPath id) and "kv" (misc values).
let dbPromise;
let locked = false; // set while/after wiping so nothing can quietly recreate the data
function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('rune', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('files', { keyPath: 'id' });
      req.result.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(store, mode, fn) {
  if (locked) return Promise.reject(new Error('Rune data was deleted'));
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req?.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

export const idb = {
  all: (store) => run(store, 'readonly', (s) => s.getAll()),
  get: (store, key) => run(store, 'readonly', (s) => s.get(key)),
  put: (store, value, key) => run(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key))),
  del: (store, key) => run(store, 'readwrite', (s) => s.delete(key)),
};

/** Deletes the whole Rune database (songs, videos, covers, playlists, profile, stats). */
export async function wipeDatabase() {
  locked = true;
  try { (await dbPromise)?.close(); } catch { /* not opened yet */ }
  dbPromise = null;
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase('rune');
    req.onsuccess = resolve;
    req.onblocked = resolve;   // another tab still has it open; it is deleted as soon as that tab lets go
    req.onerror = () => reject(req.error);
  });
}
