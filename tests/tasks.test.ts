import test from "node:test";
import assert from "node:assert/strict";
import {
  DAY,
  HOUR,
  SIZE,
  APP_CAPACITY,
  fitRadii,
  formatDate,
  formatTime,
  fromInputs,
  mood,
  naturalRadius,
  progress,
  relative,
  splitTask,
  toInputDate,
} from "../src/tasks.ts";
import type { Task } from "../src/tasks.ts";
import { JAR_AREA } from "../src/physics.ts";

const now = new Date(2026, 8, 7, 14, 30).getTime();
const task = (over: Partial<Task>): Task => ({
  id: "t",
  title: "A thing",
  color: "#cbb3c5",
  createdAt: now,
  deadline: null,
  ...over,
});

test("a free task is awake and grows a little every hour, then stops", () => {
  const t = task({ createdAt: now - 10 * HOUR });
  assert.equal(mood(t, now), "awake");
  assert.equal(naturalRadius(t, now), SIZE.min + 10 * SIZE.freePerHour);
  assert.equal(naturalRadius(t, now + 400 * HOUR), SIZE.freeMax);
  assert.equal(naturalRadius(t, t.createdAt - HOUR), SIZE.min, "never shrinks below min");
});
test("a free task that lingers turns sheepish, and only free tasks do", () => {
  const t = task({ createdAt: now - 3 * DAY });
  assert.equal(mood(t, now), "awake");
  assert.equal(mood(t, now + 3 * DAY), "sheepish");
  assert.equal(mood(t, now + 30 * DAY), "sheepish", "never becomes uncomfortable");
  const due = task({ createdAt: now - 30 * DAY, deadline: now + DAY });
  assert.equal(mood(due, now), "asleep", "a big sleeper is still just asleep");
});
test("a deadlined task sleeps, grows with the share of its time used, then squirms at max", () => {
  const t = task({ createdAt: now - 2 * DAY, deadline: now + 2 * DAY });
  assert.equal(mood(t, now), "asleep");
  assert.equal(progress(t, now), 0.5);
  assert.equal(naturalRadius(t, now), (SIZE.min + SIZE.deadlineMax) / 2);
  assert.equal(mood(t, now + 3 * DAY), "uncomfortable");
  assert.equal(naturalRadius(t, now + 30 * DAY), SIZE.deadlineMax);
  assert.ok(SIZE.deadlineMax < SIZE.freeMax, "the uncomfortable size is modest");
});
test("a deadline in the past at creation counts as fully elapsed", () => {
  const t = task({ deadline: now - HOUR });
  assert.equal(progress(t, now), 1);
  assert.equal(mood(t, now), "uncomfortable");
});
test("the cast is scaled down together when it would overfill the jar", () => {
  const tasks = Array.from({ length: 12 }, (_, i) =>
    task({ id: `t${i}`, createdAt: now - 30 * DAY }),
  );
  const radii = fitRadii(tasks, now);
  const total = [...radii.values()].reduce((s, r) => s + Math.PI * r * r, 0);
  assert.ok(total <= JAR_AREA * APP_CAPACITY + 1);
  assert.ok([...radii.values()].every((r) => r < SIZE.freeMax));
  const one = fitRadii([tasks[0]], now);
  assert.equal(one.get("t0"), SIZE.freeMax, "alone, nothing is scaled");
});
test("splitting makes fresh small steps in the parent's colour", () => {
  const parent = task({ createdAt: now - 5 * DAY, deadline: now + DAY, color: "#abc" });
  const steps = splitTask(parent, [" one ", "", "two", "three"], now);
  assert.equal(steps.length, 3);
  assert.deepEqual(
    steps.map((s) => s.title),
    ["one", "two", "three"],
  );
  for (const s of steps) {
    assert.equal(s.color, "#abc");
    assert.equal(s.createdAt, now);
    assert.equal(s.deadline, parent.deadline, "a live deadline is inherited");
    assert.equal(naturalRadius(s, now), SIZE.min);
  }
  assert.equal(new Set(steps.map((s) => s.id)).size, 3);
});
test("steps of an overdue task get no deadline", () => {
  const parent = task({ createdAt: now - 5 * DAY, deadline: now - DAY });
  for (const s of splitTask(parent, ["a", "b"], now)) {
    assert.equal(s.deadline, null);
    assert.equal(mood(s, now), "awake");
  }
});
test("dates read dd/mm/yyyy and times read on a 24 hour clock", () => {
  assert.equal(formatDate(now), "07/09/2026");
  assert.equal(formatTime(now), "14:30");
  assert.equal(formatTime(new Date(2026, 0, 1, 0, 5).getTime()), "00:05");
  assert.equal(toInputDate(now), "2026-09-07");
  assert.equal(fromInputs("2026-09-09", "18:00"), new Date(2026, 8, 9, 18).getTime());
  assert.equal(fromInputs("2026-09-09", ""), new Date(2026, 8, 9, 9).getTime());
  assert.equal(fromInputs("", "18:00"), null);
});
test("relative time reads naturally either way", () => {
  assert.equal(relative(now + 30_000, now), "just now");
  assert.equal(relative(now + 3 * HOUR, now), "in 3 hours");
  assert.equal(relative(now - DAY, now), "1 day ago");
  assert.equal(relative(now - 2.6 * DAY, now), "3 days ago");
  assert.equal(relative(now + 20 * 60_000, now), "in 20 minutes");
});
