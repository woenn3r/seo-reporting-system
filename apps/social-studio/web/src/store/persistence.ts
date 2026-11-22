// Storage boundaries of the app. The store and UI only talk to these interfaces;
// swapping the local implementations for an API-backed one is the migration path to a backend.

export interface WorkspaceRepository {
  /** Raw persisted workspace (unvalidated) or null if nothing is stored. */
  load(): unknown | null;
  /** Returns false if the data could not be persisted (e.g. quota exceeded). */
  save(workspace: unknown): boolean;
  /** Notifies when the workspace was changed elsewhere (another tab / later: server push). */
  subscribe(onExternalChange: () => void): () => void;
}

export interface MediaStorage {
  put(key: string, blob: Blob): Promise<void>;
  get(key: string): Promise<Blob | undefined>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
  estimate(): Promise<{ usage?: number; quota?: number }>;
}

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): boolean;
}

/** localStorage wrapper that never throws (private mode, blocked storage, quota). */
export const localKeyValue: KeyValueStore = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
};

export function localWorkspaceRepository(key: string, kv: KeyValueStore = localKeyValue): WorkspaceRepository {
  return {
    load() {
      const raw = kv.get(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return undefined; // present but unreadable → caller treats as corrupt
      }
    },
    save: (workspace) => kv.set(key, JSON.stringify(workspace)),
    subscribe(onExternalChange) {
      if (typeof window === "undefined") return () => undefined;
      const handler = (e: StorageEvent) => {
        if (e.key === key) onExternalChange();
      };
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    },
  };
}
