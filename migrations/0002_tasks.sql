-- One row per task per user. Rows are never removed: a set-free task keeps
-- its row with deletedAt set, so other devices learn about the deletion.
--
-- updatedAt is stamped by the device that made the change and decides
-- conflicts (last write wins). syncedAt is stamped by the Worker when the row
-- lands and is the cursor devices pull from, so a device with a slow clock
-- cannot make its changes invisible to the others.
CREATE TABLE "task" (
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL,
  "deadline" INTEGER,
  "updatedAt" INTEGER NOT NULL,
  "deletedAt" INTEGER,
  "syncedAt" INTEGER NOT NULL,
  PRIMARY KEY ("userId", "id")
);
CREATE INDEX "task_user_synced_idx" ON "task" ("userId", "syncedAt");
