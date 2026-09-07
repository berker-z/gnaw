/** Per-user task rows in D1, and the one sync operation devices use: send my
 * changes, get back everything I have not seen. */
import type { Change, SyncResponse } from "../src/protocol";

type Row = {
  id: string;
  title: string;
  color: string;
  createdAt: number;
  deadline: number | null;
  updatedAt: number;
  deletedAt: number | null;
  syncedAt: number;
};

/** Apply a device's changes (last write wins, by the device-stamped
 * `updatedAt`) and return every row that landed after `since`. */
export async function sync(
  db: D1Database,
  userId: string,
  since: number,
  changes: Change[],
  now = Date.now(),
): Promise<SyncResponse> {
  if (changes.length) {
    const upsert = db.prepare(
      `INSERT INTO task (userId, id, title, color, createdAt, deadline, updatedAt, deletedAt, syncedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
       ON CONFLICT (userId, id) DO UPDATE SET
         title = excluded.title, color = excluded.color,
         createdAt = excluded.createdAt, deadline = excluded.deadline,
         updatedAt = excluded.updatedAt, deletedAt = excluded.deletedAt,
         syncedAt = excluded.syncedAt
       WHERE excluded.updatedAt > task.updatedAt`,
    );
    await db.batch(
      changes.map((c) =>
        upsert.bind(
          userId,
          c.id,
          c.title,
          c.color,
          c.createdAt,
          c.deadline,
          c.updatedAt,
          c.deletedAt,
          now,
        ),
      ),
    );
  }
  // `>=` rather than `>`: two writes can share a millisecond, and applying a
  // row twice is harmless. Deletions older than a month are not worth
  // sending to a device that asks for everything.
  const { results } = await db
    .prepare(
      `SELECT id, title, color, createdAt, deadline, updatedAt, deletedAt, syncedAt
       FROM task WHERE userId = ?1 AND syncedAt >= ?2
         AND (deletedAt IS NULL OR ?2 > 0 OR deletedAt > ?3)
       ORDER BY syncedAt`,
    )
    .bind(userId, since, now - 30 * 24 * 3600 * 1000)
    .all<Row>();
  const cursor = results.reduce((m, r) => Math.max(m, r.syncedAt), since);
  return {
    cursor: Math.max(cursor, now),
    changes: results.map(({ syncedAt: _, ...rest }) => rest),
  };
}

/** Whether the user has any rows at all. Used once, when a device signs in
 * with things already in its jar: an empty account adopts them. */
export async function isEmpty(db: D1Database, userId: string) {
  const row = await db
    .prepare("SELECT 1 AS one FROM task WHERE userId = ?1 LIMIT 1")
    .bind(userId)
    .first();
  return row === null;
}
