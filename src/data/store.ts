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

/**
 * Storage must never hold up the app. A browser can leave an IndexedDB request pending
 * for ever — privacy settings, an extension, another tab holding an upgrade — and the
 * first render waits on this, so an unanswered request would mean a blank page. Every
 * call is raced against a deadline and gives up rather than hang.
 */
const LIMIT_MS = 4000;

const within = <T>(work: Promise<T>, fallback: T, ms = LIMIT_MS) =>
  Promise.race([
    work,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);

const openDb = () =>
  within(
    new Promise<IDBDatabase | null>((resolve) => {
      if (typeof indexedDB === 'undefined') return resolve(null);
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(DB, 1);
      } catch {
        return resolve(null);
      }
      if (!request || typeof request !== 'object') return resolve(null);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    }),
    null,
  );

export async function readRecordStore<T>(): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  const value = await within<T | null>(
    new Promise((resolve) => {
      try {
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
        request.onsuccess = () => resolve((request.result as T) ?? null);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    }),
    null,
  );
  try {
    db.close();
  } catch {
    /* already closing */
  }
  return value;
}

/** Returns a reason when the records could not be kept, so the panel can say so. */
export async function writeRecordStore(value: unknown): Promise<string | null> {
  const db = await openDb();
  if (!db) return 'this browser will not store records for a local file';
  // a season of records is a big write, so this one gets a longer rope than a read
  const ok = await within(
    new Promise<boolean>((resolve) => {
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
    }),
    false,
    60_000,
  );
  try {
    db.close();
  } catch {
    /* already closing */
  }
  return ok ? null : 'the records were too large for this browser to keep';
}
