// Binary storage for uploaded videos/images (browser IndexedDB).
// MVP only: data stays in this browser. A production setup replaces this module with
// a backend object storage (resumable uploads) – the interface stays the same.

import { t as tr } from "../i18n";

const DB_NAME = "social-studio-media";
const STORE = "blobs";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error(tr("error.idbUnavailable")));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error(tr("error.idbOpen")));
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      let result: T;
      req.onsuccess = () => {
        result = req.result;
      };
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error ?? req.error ?? new Error(tr("error.storage")));
      t.onabort = () => reject(t.error ?? new Error(tr("error.storageAborted")));
    });
  } finally {
    db.close();
  }
}

export const mediaStore = {
  put: (key: string, blob: Blob) => tx("readwrite", (s) => s.put(blob, key)).then(() => undefined),
  get: (key: string) => tx<Blob | undefined>("readonly", (s) => s.get(key) as IDBRequest<Blob | undefined>),
  remove: (key: string) => tx("readwrite", (s) => s.delete(key)).then(() => undefined),
  clear: () => tx("readwrite", (s) => s.clear()).then(() => undefined),
  async estimate(): Promise<{ usage?: number; quota?: number }> {
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) return navigator.storage.estimate();
    return {};
  },
};

/** Reads duration (seconds) of a local video file; resolves undefined if not determinable. */
export function probeVideoDuration(file: Blob): Promise<number | undefined> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(undefined);
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = (d?: number) => {
      URL.revokeObjectURL(url);
      resolve(d !== undefined && Number.isFinite(d) ? d : undefined);
    };
    v.onloadedmetadata = () => done(v.duration);
    v.onerror = () => done(undefined);
    setTimeout(() => done(undefined), 8000);
    v.src = url;
  });
}
