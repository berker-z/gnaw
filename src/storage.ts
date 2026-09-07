/** Persistence behind a small interface. The jar only ever loads a list and
 * saves a list; where it goes (localStorage, an account in the cloud, memory
 * in tests) is the store's business. A store that can learn about changes
 * from elsewhere offers `subscribe`. */
import type { Task } from "./tasks";
import { isTask } from "./sync";

export interface TaskStore {
  /** The cached list, or null when there has never been one (seed time). */
  load(): Task[] | null;
  save(tasks: Task[]): boolean;
  /** Changes that arrived from another device. The listener gets the whole
   * list. */
  subscribe?(listener: (tasks: Task[]) => void): () => void;
}

const KEY = "gnaw.tasks.v1";

/** The original, cache-only store. The app now uses `createSyncStore` from
 * ./sync, which reads this format on first run; this stays for tests and as
 * the simplest possible implementation of the interface. */
export const localStore: TaskStore = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.version !== 1 || !Array.isArray(parsed.tasks)) return null;
      return parsed.tasks.filter(isTask);
    } catch {
      return null;
    }
  },
  save(tasks) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, tasks }));
      return true;
    } catch {
      return false;
    }
  },
};

export const memoryStore = (): TaskStore => {
  let tasks: Task[] | null = null;
  return {
    load: () => tasks,
    save(next) {
      tasks = next;
      return true;
    },
  };
};
