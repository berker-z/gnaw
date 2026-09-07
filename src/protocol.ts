/** The wire format between a device and the Worker. Shared by both sides, so
 * it must stay free of DOM and Workers types. */

/** A task as a device knows it. `updatedAt` is stamped by the device on every
 * change and decides conflicts: the latest write wins. */
export type SyncTask = {
  id: string;
  title: string;
  color: string;
  createdAt: number;
  deadline: number | null;
  updatedAt: number;
};

/** A change a device wants to send: an upsert, or a deletion (tombstone). */
export type Change = SyncTask & { deletedAt: number | null };

/** What the Worker sends back: every row that landed after `since`
 * (including deletions), plus the cursor to ask from next time. */
export type SyncResponse = {
  cursor: number;
  changes: Change[];
};

export type SyncRequest = {
  /** The cursor from the last response; 0 for everything. */
  since: number;
  changes: Change[];
};

export const LIMITS = { title: 500, color: 32, changes: 500 } as const;

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Accept a change from the network only when every field is what it says. */
export const isChange = (c: unknown): c is Change => {
  if (typeof c !== "object" || c === null) return false;
  const x = c as Record<string, unknown>;
  return (
    typeof x.id === "string" &&
    x.id.length > 0 &&
    x.id.length <= 64 &&
    typeof x.title === "string" &&
    x.title.length <= LIMITS.title &&
    typeof x.color === "string" &&
    x.color.length <= LIMITS.color &&
    finite(x.createdAt) &&
    (x.deadline === null || finite(x.deadline)) &&
    finite(x.updatedAt) &&
    (x.deletedAt === null || finite(x.deletedAt))
  );
};

export const isSyncRequest = (r: unknown): r is SyncRequest =>
  typeof r === "object" &&
  r !== null &&
  finite((r as SyncRequest).since) &&
  Array.isArray((r as SyncRequest).changes) &&
  (r as SyncRequest).changes.length <= LIMITS.changes &&
  (r as SyncRequest).changes.every(isChange);
