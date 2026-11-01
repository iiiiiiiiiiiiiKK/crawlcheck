/**
 * Check history storage.
 *
 * IndexedDB is used when available (it handles a few hundred KB of reports
 * comfortably); otherwise we transparently fall back to localStorage. Nothing is
 * ever uploaded — this module touches browser storage only.
 */

import type { HistoryEntry, Report } from './types';

const DB_NAME = 'crawlcheck';
const DB_VERSION = 1;
const STORE = 'history';
const LS_KEY = 'crawlcheck.history.v1';
export const MAX_ENTRIES = 30;

export type StorageKind = 'indexeddb' | 'localstorage' | 'unavailable';

export function storageKind(): StorageKind {
  try {
    if (typeof indexedDB !== 'undefined' && indexedDB) return 'indexeddb';
  } catch {
    /* fall through */
  }
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return 'localstorage';
  } catch {
    /* fall through */
  }
  return 'unavailable';
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Reports keep a bounded amount of raw source so history stays small. */
export function compactReport(report: Report): Report {
  const raw = report.robots?.raw ?? '';
  return {
    ...report,
    robots: report.robots
      ? { ...report.robots, raw: raw.length > 20_000 ? `${raw.slice(0, 20_000)}\n… (truncated for history)` : raw }
      : null,
    sitemaps: report.sitemaps.map((sitemap) => ({
      ...sitemap,
      entries: sitemap.entries.slice(0, 200),
      childSitemaps: sitemap.childSitemaps.slice(0, 100),
    })),
  };
}

export function toHistoryEntry(report: Report): HistoryEntry {
  const compact = compactReport(report);
  return {
    id: report.id,
    createdAt: report.createdAt,
    mode: report.mode,
    input: report.target.input,
    host: report.target.host,
    score: report.score.value,
    grade: report.score.grade,
    fail: report.score.fail,
    warn: report.score.warn,
    unverified: report.score.unverified,
    error: report.score.error,
    pass: report.score.pass,
    report: compact,
  };
}

/* ------------------------------------------------------------------- api */

export async function listHistory(): Promise<HistoryEntry[]> {
  if (storageKind() === 'indexeddb') {
    const db = await openDb();
    if (db) {
      try {
        const entries = await new Promise<HistoryEntry[]>((resolve) => {
          const tx = db.transaction(STORE, 'readonly');
          const request = tx.objectStore(STORE).getAll();
          request.onsuccess = () => resolve((request.result as HistoryEntry[]) ?? []);
          request.onerror = () => resolve([]);
        });
        db.close();
        return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      } catch {
        db.close();
      }
    }
  }
  return listLocal();
}

export async function saveReport(report: Report): Promise<boolean> {
  // Demo reports must never mix with real checks.
  if (report.mode === 'demo') return false;
  const entry = toHistoryEntry(report);

  if (storageKind() === 'indexeddb') {
    const db = await openDb();
    if (db) {
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(entry);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        const all = await listHistory();
        const extra = all.slice(MAX_ENTRIES);
        for (const old of extra) await deleteEntryId(old.id);
        db.close();
        return true;
      } catch {
        db.close();
      }
    }
  }
  return saveLocal(entry);
}

export async function deleteEntry(id: string): Promise<void> {
  if (storageKind() === 'indexeddb') {
    const db = await openDb();
    if (db) {
      try {
        await deleteEntryId(id);
        db.close();
        return;
      } catch {
        db.close();
      }
    }
  }
  const entries = listLocal().filter((entry) => entry.id !== id);
  writeLocal(entries);
}

async function deleteEntryId(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
  db.close();
}

export async function clearHistory(): Promise<void> {
  if (storageKind() === 'indexeddb') {
    const db = await openDb();
    if (db) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
      db.close();
      return;
    }
  }
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

/* --------------------------------------------------------- localStorage */

function listLocal(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

function saveLocal(entry: HistoryEntry): boolean {
  try {
    const entries = [entry, ...listLocal().filter((item) => item.id !== entry.id)].slice(0, MAX_ENTRIES);
    writeLocal(entries);
    return true;
  } catch {
    return false;
  }
}

function writeLocal(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
  } catch {
    // Quota exceeded: drop the oldest half and retry once.
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(entries.slice(0, Math.max(1, Math.floor(entries.length / 2)))));
    } catch {
      /* give up silently: history is a convenience, not a requirement */
    }
  }
}
