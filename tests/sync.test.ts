import test from "node:test";
import assert from "node:assert/strict";
import { adopt, diff, emptyCache, merge, migrateV1 } from "../src/sync.ts";
import type { Cache } from "../src/sync.ts";
import type { Task } from "../src/tasks.ts";
import { isChange, isSyncRequest } from "../src/protocol.ts";

const now = 1_700_000_000_000;
const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  color: "#cbb3c5",
  createdAt: now - 1000,
  deadline: null,
  ...over,
});

test("diff stamps new and changed tasks and tombstones the missing ones", () => {
  let c = diff(emptyCache(), [task("a"), task("b")], now);
  assert.deepEqual(Object.keys(c.pending).sort(), ["a", "b"]);
  assert.equal(c.pending.a.updatedAt, now);
  assert.equal(c.pending.a.deletedAt, null);
  c = { ...c, pending: {} }; // pretend the Worker took them
  c = diff(c, [task("a", { title: "Renamed" })], now + 5);
  assert.deepEqual(Object.keys(c.pending).sort(), ["a", "b"]);
  assert.equal(c.pending.a.title, "Renamed");
  assert.equal(c.pending.a.updatedAt, now + 5);
  assert.equal(c.pending.b.deletedAt, now + 5, "b was removed: tombstone");
  assert.equal(c.stamps.b, undefined);
  assert.deepEqual(c.tasks.map((t) => t.id), ["a"]);
});

test("diff moves a stamp forward even when the clock stands still", () => {
  let c = diff(emptyCache(), [task("a")], now);
  c = diff(c, [task("a", { title: "x" })], now);
  assert.equal(c.pending.a.updatedAt, now + 1);
});

test("diff leaves untouched tasks out of pending", () => {
  let c = diff(emptyCache(), [task("a"), task("b")], now);
  c = { ...c, pending: {} };
  c = diff(c, [task("a"), task("b")], now + 1);
  assert.deepEqual(c.pending, {});
});

test("merge applies rows, honours tombstones, and keeps newer local edits", () => {
  let c = diff(emptyCache(), [task("a"), task("b")], now);
  const sent = Object.values(c.pending);
  const { cache, changed } = merge(
    c,
    {
      cursor: now + 100,
      changes: [
        // a came back as we sent it: nothing to do
        { ...task("a"), updatedAt: now, deletedAt: null },
        // b was deleted elsewhere, later than our version
        { ...task("b"), updatedAt: now + 50, deletedAt: now + 50 },
        // c is new from another device
        { ...task("c"), updatedAt: now + 20, deletedAt: null },
      ],
    },
    sent,
  );
  assert.equal(changed, true);
  assert.deepEqual(cache.tasks.map((t) => t.id).sort(), ["a", "c"]);
  assert.deepEqual(cache.pending, {}, "sent changes are cleared");
  assert.equal(cache.cursor, now + 100);
  assert.equal(cache.stamps.c, now + 20);
});

test("merge does not clear a pending change edited while in flight", () => {
  let c = diff(emptyCache(), [task("a")], now);
  const sent = Object.values(c.pending);
  c = diff(c, [task("a", { title: "edited mid-flight" })], now + 10);
  const { cache } = merge(
    c,
    { cursor: now + 5, changes: [{ ...task("a"), updatedAt: now, deletedAt: null }] },
    sent,
  );
  assert.equal(cache.pending.a?.title, "edited mid-flight");
  assert.equal(cache.tasks[0].title, "edited mid-flight", "older row does not overwrite");
});

test("an incoming row newer than the local pending edit wins", () => {
  let c = diff(emptyCache(), [task("a", { title: "mine" })], now);
  const { cache } = merge(
    c,
    { cursor: now + 9, changes: [{ ...task("a", { title: "theirs" }), updatedAt: now + 5, deletedAt: null }] },
    [],
  );
  assert.equal(cache.tasks[0].title, "theirs");
  assert.equal(cache.pending.a?.title, "mine", "still pushed, and the Worker will refuse it as older");
});

test("adopt queues every cached task as a fresh change", () => {
  const c: Cache = { ...emptyCache(), tasks: [task("a"), task("b")], stamps: { a: 1, b: 2 } };
  const a = adopt(c, now);
  assert.deepEqual(Object.keys(a.pending).sort(), ["a", "b"]);
  assert.equal(a.pending.a.updatedAt, now);
});

test("the version 1 cache migrates and rejects junk", () => {
  const m = migrateV1({ version: 1, tasks: [task("a"), { nope: true }] });
  assert.equal(m?.tasks.length, 1);
  assert.equal(m?.stamps.a, task("a").createdAt);
  assert.equal(migrateV1({ version: 3 }), null);
  assert.equal(migrateV1("x"), null);
});

test("the wire validators are strict", () => {
  const ok = { ...task("a"), updatedAt: now, deletedAt: null };
  assert.equal(isChange(ok), true);
  assert.equal(isChange({ ...ok, title: "x".repeat(501) }), false);
  assert.equal(isChange({ ...ok, deadline: "tomorrow" }), false);
  assert.equal(isChange({ ...ok, updatedAt: NaN }), false);
  assert.equal(isSyncRequest({ since: 0, changes: [ok] }), true);
  assert.equal(isSyncRequest({ since: "0", changes: [] }), false);
  assert.equal(isSyncRequest({ since: 0, changes: [{}] }), false);
});
