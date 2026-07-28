/**
 * Where a loaded workbook is kept between visits.
 *
 * The settings are small and go in localStorage, read synchronously at import time. The
 * measurement records are not — a season of animal positions is tens of megabytes, past
 * anything localStorage will hold — so those live in IndexedDB and are fetched once,
 * before the first render.
 */

const DB = 'farmerswingman';
const STORE = 'records';
const KEY = 'current';

const openDb = () =>
  new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB, 1);
    } catch {
      return resolve(null);
    }
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

export async function readRecordStore<T>(): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  const value = await new Promise<T | null>((resolve) => {
    try {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve((request.result as T) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  db.close();
  return value;
}

/** Returns a reason when the records could not be kept, so the panel can say so. */
export async function writeRecordStore(value: unknown): Promise<string | null> {
  const db = await openDb();
  if (!db) return 'this browser will not store records for a local file';
  const ok = await new Promise<boolean>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      if (value === null) tx.objectStore(STORE).delete(KEY);
      else tx.objectStore(STORE).put(value, KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
  db.close();
  return ok ? null : 'the records were too large for this browser to keep';
}
