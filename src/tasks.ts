/** The task domain. No physics, no React, no DOM: a task is a title with
 * timestamps, and everything visible about its creature (size, mood, status
 * text) is a pure function of the task and the current time. */
import { JAR_AREA, PALETTE } from "./physics.ts";

export type Task = {
  id: string;
  title: string;
  color: string;
  /** When it landed on your mind. Milliseconds since the epoch. */
  createdAt: number;
  /** Optional. A deadlined task sleeps until this moment, then squirms. */
  deadline: number | null;
};
export type Mood = "awake" | "sheepish" | "asleep" | "uncomfortable";

export const HOUR = 3_600_000,
  DAY = 24 * HOUR;

/** Creature sizes, in jar pixels. A deadlined creature grows from `min` to
 * `deadlineMax` over its whole allotted time and stops there, uncomfortable.
 * A free creature grows a little every hour and can get bigger, but it never
 * minds. */
export const SIZE = {
  min: 32,
  deadlineMax: 82,
  freeMax: 118,
  freePerHour: 0.55,
  /** A free creature this far along from `min` to `freeMax` (about four and
   * a half days) starts to feel sheepish about how much room it takes. */
  sheepishAt: 0.7,
};
/** The share of the jar the cast may fill before everyone is scaled down
 * together. Below the north star's tightest panel so there is always a
 * little air. */
export const APP_CAPACITY = 0.8;

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const colorFor = (index: number) => PALETTE[index % PALETTE.length];

export function createTask(
  title: string,
  deadline: number | null,
  now: number,
  color: string,
): Task {
  return { id: newId(), title: title.trim(), color, createdAt: now, deadline };
}

/** 0 at creation, 1 at the deadline, clamped. */
export function progress(task: Task, now: number) {
  if (task.deadline === null) return 0;
  const span = task.deadline - task.createdAt;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (now - task.createdAt) / span));
}

export function mood(task: Task, now: number): Mood {
  if (task.deadline !== null)
    return now < task.deadline ? "asleep" : "uncomfortable";
  const grown =
    (naturalRadius(task, now) - SIZE.min) / (SIZE.freeMax - SIZE.min);
  return grown >= SIZE.sheepishAt ? "sheepish" : "awake";
}

/** The size a creature would like to be, before the jar has its say. */
export function naturalRadius(task: Task, now: number) {
  if (task.deadline !== null)
    return SIZE.min + (SIZE.deadlineMax - SIZE.min) * progress(task, now);
  const hours = Math.max(0, now - task.createdAt) / HOUR;
  return Math.min(SIZE.freeMax, SIZE.min + SIZE.freePerHour * hours);
}

/** Sizes for the whole cast. When they would overfill the jar, everyone is
 * scaled down by the same factor, so relative sizes still read. */
export function fitRadii(tasks: Task[], now: number) {
  const natural = new Map(tasks.map((t) => [t.id, naturalRadius(t, now)]));
  const total = [...natural.values()].reduce((s, r) => s + Math.PI * r * r, 0);
  const room = JAR_AREA * APP_CAPACITY;
  const scale = total > room ? Math.sqrt(room / total) : 1;
  for (const [id, r] of natural) natural.set(id, Math.max(SIZE.min * 0.6, r * scale));
  return natural;
}

/** Split one task into smaller steps. The steps start fresh (small), keep
 * the parent's colour so they still read as one family, and inherit the
 * deadline while it is still ahead. Steps of an overdue task get no deadline:
 * the point of splitting is to make it approachable again, not to hatch
 * several uncomfortable creatures at once. */
export function splitTask(parent: Task, titles: string[], now: number): Task[] {
  const deadline =
    parent.deadline !== null && parent.deadline > now ? parent.deadline : null;
  return titles
    .map((t) => t.trim())
    .filter(Boolean)
    .map((title) => ({
      id: newId(),
      title,
      color: parent.color,
      createdAt: now,
      deadline,
    }));
}

const two = (n: number) => String(n).padStart(2, "0");
/** dd/mm/yyyy */
export const formatDate = (ms: number) => {
  const d = new Date(ms);
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`;
};
/** HH:mm, 24 hour clock. */
export const formatTime = (ms: number) => {
  const d = new Date(ms);
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
};
export const formatMoment = (ms: number) =>
  `${formatDate(ms)} · ${formatTime(ms)}`;
/** Values for native date and time inputs (local time). */
export const toInputDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
export const toInputTime = formatTime;
/** Local date and time from the inputs; null when no date was given. */
export function fromInputs(date: string, time: string): number | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "09:00").split(":").map(Number);
  if (![y, m, d, hh, mm].every(Number.isFinite)) return null;
  return new Date(y, m - 1, d, hh, mm).getTime();
}

/** "in 3 hours", "2 days ago", "just now". */
export function relative(ms: number, now: number) {
  const delta = ms - now,
    abs = Math.abs(delta);
  const unit =
    abs < HOUR
      ? [Math.max(1, Math.round(abs / 60_000)), "minute"]
      : abs < DAY
        ? [Math.round(abs / HOUR), "hour"]
        : [Math.round(abs / DAY), "day"];
  if (abs < 90_000) return "just now";
  const text = `${unit[0]} ${unit[1]}${unit[0] === 1 ? "" : "s"}`;
  return delta > 0 ? `in ${text}` : `${text} ago`;
}

/** A line about how the creature is doing. */
export function describe(task: Task, now: number) {
  const m = mood(task, now);
  if (m === "asleep")
    return `Asleep until ${formatMoment(task.deadline!)}. Due ${relative(task.deadline!, now)}.`;
  if (m === "uncomfortable")
    return `Was due ${formatMoment(task.deadline!)}, ${relative(task.deadline!, now)}. A bit uncomfortable now.`;
  if (m === "sheepish")
    return "No deadline, but it’s been here a while and knows it.";
  return "No deadline. Growing a little every hour.";
}

export function demoTasks(now: number): Task[] {
  const make = (
    title: string,
    ageHours: number,
    deadlineHours: number | null,
    color: number,
  ): Task => ({
    id: newId(),
    title,
    color: colorFor(color),
    createdAt: now - ageHours * HOUR,
    deadline: deadlineHours === null ? null : now + deadlineHours * HOUR,
  });
  return [
    make("Water the plants", 6 * 24, null, 0),
    make("Reply to Maya", 2 * 24, null, 1),
    make("Book the dentist", 5 * 24, 2 * 24, 2),
    make("Send the invoice", 4 * 24, -20, 3),
    make("Read a chapter", 10, null, 4),
    make("Go for a walk", 1, 30, 5),
  ];
}
