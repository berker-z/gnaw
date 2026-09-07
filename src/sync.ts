/** Cache-first sync. The jar always reads and writes a local cache, so it
 * opens instantly and works offline; signed in, every change is also queued
 * for the Worker and whatever other devices sent comes back the same way.
 *
 * The domain `Task` has no notion of versions. This module stamps an
 * `updatedAt` per task on the way out (the store diffs each save against the
 * last one) and keeps it beside the cache. Conflicts are last write wins on
 * that stamp; deletions travel as tombstones.
 *
 * The pure parts (`diff`, `merge`, `migrateV1`) are DOM-free and unit tested.
 * `createSyncStore` wires them to localStorage, fetch and timers. */
import type { Task } from "./tasks";
import type { Change, SyncRequest, SyncResponse } from "./protocol";
import type { TaskStore } from "./storage";

export type Cache = {
  version: 2;
  tasks: Task[];
  /** updatedAt per task id, for every task in `tasks`. */
  stamps: Record<string, number>;
  /** Changes not yet accepted by the Worker, by task id. */
  pending: Record<string, Change>;
  /** The Worker's cursor from the last successful sync; 0 for never. */
  cursor: number;
};

export const emptyCache = (): Cache => ({
  version: 2,
  tasks: [],
  stamps: {},
  pending: {},
  cursor: 0,
});

const same = (a: Task, b: Task) =>
  a.title === b.title &&
  a.color === b.color &&
  a.createdAt === b.createdAt &&
  a.deadline === b.deadline;

/** What changed between the last saved list and this one, stamped `now`.
 * Returns the cache to keep, with the changes added to `pending`. */
export function diff(cache: Cache, next: Task[], now: number): Cache {
  const prev = new Map(cache.tasks.map((t) => [t.id, t]));
  const stamps = { ...cache.stamps };
  const pending = { ...cache.pending };
  const seen = new Set<string>();
  for (const t of next) {
    seen.add(t.id);
    const before = prev.get(t.id);
    if (before && same(before, t) && stamps[t.id] !== undefined) continue;
    // A stamp must move forward even if the clock did not, or the Worker
    // would keep the older version.
    const stamp = Math.max(now, (stamps[t.id] ?? 0) + 1);
    stamps[t.id] = stamp;
    pending[t.id] = { ...t, updatedAt: stamp, deletedAt: null };
  }
  for (const t of cache.tasks) {
    if (seen.has(t.id)) continue;
    const stamp = Math.max(now, (stamps[t.id] ?? 0) + 1);
    delete stamps[t.id];
    pending[t.id] = { ...t, updatedAt: stamp, deletedAt: stamp };
  }
  return { ...cache, tasks: next, stamps, pending };
}

/** Fold the Worker's answer into the cache. `sent` is what this round
 * pushed: a pending entry is cleared only if it is still the one that was
 * sent, so a change made mid-flight is not lost. Local pending changes
 * newer than an incoming row win. */
export function merge(
  cache: Cache,
  response: SyncResponse,
  sent: Change[],
): { cache: Cache; changed: boolean } {
  const tasks = new Map(cache.tasks.map((t) => [t.id, t]));
  const stamps = { ...cache.stamps };
  const pending = { ...cache.pending };
  for (const c of sent)
    if (pending[c.id] && pending[c.id].updatedAt === c.updatedAt)
      delete pending[c.id];
  let changed = false;
  for (const row of response.changes) {
    const local = pending[row.id];
    if (local && local.updatedAt >= row.updatedAt) continue;
    if (row.deletedAt !== null) {
      if (tasks.delete(row.id)) changed = true;
      delete stamps[row.id];
      continue;
    }
    const { deletedAt: _, updatedAt, ...task } = row;
    const before = tasks.get(row.id);
    if (before && same(before, task) && stamps[row.id] === updatedAt) continue;
    tasks.set(row.id, task);
    stamps[row.id] = updatedAt;
    changed = true;
  }
  return {
    cache: {
      ...cache,
      tasks: [...tasks.values()],
      stamps,
      pending,
      cursor: Math.max(cache.cursor, response.cursor),
    },
    changed,
  };
}

/** Everything in the cache as fresh changes: for adopting a signed-out jar
 * into an account that has nothing yet. */
export function adopt(cache: Cache, now: number): Cache {
  const pending = { ...cache.pending };
  const stamps = { ...cache.stamps };
  for (const t of cache.tasks) {
    if (pending[t.id]) continue;
    stamps[t.id] = now;
    pending[t.id] = { ...t, updatedAt: now, deletedAt: null };
  }
  return { ...cache, stamps, pending, cursor: 0 };
}

/** The first app pass stored a bare `{version: 1, tasks}`. */
export function migrateV1(raw: unknown): Cache | null {
  if (typeof raw !== "object" || raw === null) return null;
  const v = raw as { version?: number; tasks?: unknown };
  if (v.version !== 1 || !Array.isArray(v.tasks)) return null;
  const tasks = v.tasks.filter(isTask);
  const stamps: Record<string, number> = {};
  for (const t of tasks) stamps[t.id] = t.createdAt;
  return { ...emptyCache(), tasks, stamps };
}

export const isTask = (t: unknown): t is Task =>
  typeof t === "object" &&
  t !== null &&
  typeof (t as Task).id === "string" &&
  typeof (t as Task).title === "string" &&
  typeof (t as Task).color === "string" &&
  Number.isFinite((t as Task).createdAt) &&
  ((t as Task).deadline === null || Number.isFinite((t as Task).deadline));

const isCache = (c: unknown): c is Cache =>
  typeof c === "object" &&
  c !== null &&
  (c as Cache).version === 2 &&
  Array.isArray((c as Cache).tasks) &&
  typeof (c as Cache).stamps === "object" &&
  typeof (c as Cache).pending === "object" &&
  Number.isFinite((c as Cache).cursor);

/** The Worker, from the store's point of view. */
export interface Remote {
  sync(request: SyncRequest): Promise<SyncResponse>;
  isEmpty(): Promise<boolean>;
}

export class SignedOutError extends Error {}

export const fetchRemote = (base = ""): Remote => {
  const call = async (path: string, init?: RequestInit) => {
    const res = await fetch(base + path, { credentials: "same-origin", ...init });
    if (res.status === 401) throw new SignedOutError("Signed out.");
    if (!res.ok) throw new Error(`Sync failed (${res.status}).`);
    return res.json();
  };
  return {
    sync: (request) =>
      call("/api/tasks/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      }),
    isEmpty: async () => (await call("/api/tasks/empty")).empty === true,
  };
};

export type SyncStatus = {
  state: "local" | "syncing" | "synced" | "offline" | "error" | "signed-out";
  /** Changes still waiting for the Worker. */
  pending: number;
  /** When the last sync succeeded, if ever this visit. */
  at: number | null;
  message?: string;
};

export interface SyncStore extends TaskStore {
  subscribe(listener: (tasks: Task[]) => void): () => void;
  status(): SyncStatus;
  onStatus(listener: (status: SyncStatus) => void): () => void;
  /** Start syncing (if there is a remote). Returns a stop function. */
  start(): () => void;
  /** Sync now, e.g. when the user asks. */
  sync(): Promise<void>;
}

export const LOCAL_SCOPE = "local";
export const cacheKey = (scope: string) => `gnaw.tasks.v2.${scope}`;
const V1_KEY = "gnaw.tasks.v1";

const readCache = (scope: string): Cache | null => {
  try {
    const raw = localStorage.getItem(cacheKey(scope));
    if (raw) {
      const parsed = JSON.parse(raw);
      return isCache(parsed) ? parsed : null;
    }
    if (scope !== LOCAL_SCOPE) return null;
    const old = localStorage.getItem(V1_KEY);
    return old ? migrateV1(JSON.parse(old)) : null;
  } catch {
    return null;
  }
};
const writeCache = (scope: string, cache: Cache) => {
  try {
    localStorage.setItem(cacheKey(scope), JSON.stringify(cache));
    return true;
  } catch {
    return false;
  }
};

/** A store for one scope: `local` when signed out, the user id when signed
 * in. Each scope has its own cache, so accounts never see each other's jars
 * on a shared device. */
export function createSyncStore({
  scope,
  remote,
  now = Date.now,
}: {
  scope: string;
  remote: Remote | null;
  now?: () => number;
}): SyncStore {
  let cache = readCache(scope);
  let status: SyncStatus = {
    state: remote ? "syncing" : "local",
    pending: cache ? Object.keys(cache.pending).length : 0,
    at: null,
  };
  const listeners = new Set<(tasks: Task[]) => void>();
  const watchers = new Set<(status: SyncStatus) => void>();
  const setStatus = (next: Partial<SyncStatus>) => {
    status = {
      ...status,
      ...next,
      pending: cache ? Object.keys(cache.pending).length : 0,
    };
    for (const w of watchers) w(status);
  };

  let inFlight: Promise<void> | null = null;
  let again = false;
  let pushTimer = 0;

  const run = async () => {
    if (!remote) return;
    const sent = Object.values(cache?.pending ?? {});
    const since = cache?.cursor ?? 0;
    setStatus({ state: "syncing" });
    try {
      const response = await remote.sync({ since, changes: sent });
      const merged = merge(cache ?? emptyCache(), response, sent);
      cache = merged.cache;
      writeCache(scope, cache);
      setStatus({ state: "synced", at: now(), message: undefined });
      if (merged.changed) for (const l of listeners) l(cache.tasks);
    } catch (e) {
      if (e instanceof SignedOutError) setStatus({ state: "signed-out" });
      else if (typeof navigator !== "undefined" && navigator.onLine === false)
        setStatus({ state: "offline" });
      else setStatus({ state: "error", message: (e as Error).message });
    }
  };
  const sync = () => {
    if (!remote) return Promise.resolve();
    if (inFlight) {
      again = true;
      return inFlight;
    }
    inFlight = (async () => {
      do {
        again = false;
        await run();
      } while (again);
    })().finally(() => (inFlight = null));
    return inFlight;
  };
  const schedule = () => {
    if (!remote) return;
    clearTimeout(pushTimer);
    pushTimer = window.setTimeout(sync, 800);
  };

  return {
    load: () => {
      if (cache) return cache.tasks;
      // Signed in with nothing cached yet: the account decides, not the
      // demo seed. Signed out: null, so the jar seeds itself.
      return remote ? [] : null;
    },
    save(tasks) {
      cache = diff(cache ?? emptyCache(), tasks, now());
      const ok = writeCache(scope, cache);
      setStatus({});
      schedule();
      return ok;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    status: () => status,
    onStatus(listener) {
      watchers.add(listener);
      listener(status);
      return () => watchers.delete(listener);
    },
    start() {
      if (!remote) return () => {};
      const first = async () => {
        // Signing in with a jar already on this device: an account with
        // nothing in it takes those things over. Otherwise they stay in the
        // signed-out jar, untouched.
        if (!cache || cache.cursor === 0) {
          const local = scope !== LOCAL_SCOPE ? readCache(LOCAL_SCOPE) : null;
          if (local && local.tasks.length && (await remote.isEmpty().catch(() => false))) {
            cache = adopt({ ...(cache ?? emptyCache()), tasks: local.tasks, stamps: local.stamps }, now());
            writeCache(scope, cache);
            localStorage.removeItem(cacheKey(LOCAL_SCOPE));
            localStorage.removeItem(V1_KEY);
            for (const l of listeners) l(cache.tasks);
          }
        }
        await sync();
      };
      void first();
      const wake = () => !document.hidden && void sync();
      const timer = setInterval(wake, 90_000);
      document.addEventListener("visibilitychange", wake);
      window.addEventListener("online", wake);
      return () => {
        clearInterval(timer);
        clearTimeout(pushTimer);
        document.removeEventListener("visibilitychange", wake);
        window.removeEventListener("online", wake);
      };
    },
    sync,
  };
}
