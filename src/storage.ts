/** Persistence behind a small interface, so the native wrapper can swap in
 * something sturdier later without touching the app. Versioned, validated on
 * the way in, and never trusted blindly. */
import type { Task } from "./tasks";

export interface TaskStore {
  load(): Task[] | null;
  save(tasks: Task[]): boolean;
}

const KEY = "gnaw.tasks.v1";

const isTask = (t: unknown): t is Task =>
  typeof t === "object" &&
  t !== null &&
  typeof (t as Task).id === "string" &&
  typeof (t as Task).title === "string" &&
  typeof (t as Task).color === "string" &&
  Number.isFinite((t as Task).createdAt) &&
  ((t as Task).deadline === null || Number.isFinite((t as Task).deadline));

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
