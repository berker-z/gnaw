import React, { useEffect, useMemo, useRef, useState } from "react";
import { World, LEFT, RIGHT, TOP } from "./physics";
import type { Blob } from "./physics";
import { mountScene } from "./scene";
import type { SceneController, Mood as FaceMood } from "./scene";
import {
  colorFor,
  createTask,
  demoTasks,
  describe,
  fitRadii,
  formatMoment,
  fromInputs,
  HOUR,
  mood,
  relative,
  splitTask,
  toInputDate,
  toInputTime,
} from "./tasks";
import type { Task } from "./tasks";
import { localStore } from "./storage";
import type { TaskStore } from "./storage";
import { Sheet } from "./Sheet";

type Modal =
  | { kind: "task"; id: string }
  | { kind: "edit"; id: string }
  | { kind: "split"; id: string }
  | { kind: "add" }
  | { kind: "list" }
  | null;

const MOOD_LABEL = {
  awake: "Awake, growing slowly",
  sheepish: "Been here a while, a little sheepish",
  asleep: "Asleep until its deadline",
  uncomfortable: "Past its deadline",
};

export function Jar({ store = localStore }: { store?: TaskStore }) {
  const [world] = useState(() => new World());
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<SceneController | null>(null);
  /** Task id to creature id. Creatures are a view of tasks. */
  const blobOf = useRef(new Map<string, number>());
  const tasksRef = useRef<Task[]>([]);
  const [tasks, setTasksState] = useState<Task[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const toastTimer = useRef(0);

  const setTasks = (next: Task[]) => {
    tasksRef.current = next;
    setTasksState(next);
    if (!store.save(next))
      say("Couldn’t save. Changes last for this visit only.");
  };
  const say = (text: string, undo?: () => void) => {
    setToast({ text, undo });
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), undo ? 7000 : 3200);
  };

  /** Every creature eases toward the size its task has earned. */
  const resize = () => {
    const t = Date.now();
    setNow(t);
    const radii = fitRadii(tasksRef.current, t);
    for (const b of world.blobs) {
      const entry = [...blobOf.current].find(([, id]) => id === b.id);
      const r = entry && radii.get(entry[0]);
      if (r && Math.abs(r - b.target) > 0.25) b.target = r;
    }
  };

  /** Build the pile the way the playground presets do: one creature at a
   * time, at its full size, each settling before the next drops. Dropping
   * everyone at once, small, and inflating them in a heap left the memory
   * foam remembering the heap: slabs, lobes, and a pile that oozed for
   * minutes. The order is a shuffle keyed on task ids, so big and small
   * mingle and the pile looks the same on every load. */
  const buildPile = (list: Task[], radii: Map<string, number>) => {
    const key = (id: string) =>
      [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
    [...list]
      .sort((a, b) => key(a.id) - key(b.id))
      .forEach((task, i) => {
        const r = radii.get(task.id)!;
        const x =
          LEFT + r + 8 + ((i * 0.618) % 1) * (RIGHT - LEFT - 2 * r - 16);
        const b = world.add(task.title, x, TOP + r + 4, r, task.color);
        if (!b) return;
        blobOf.current.set(task.id, b.id);
        for (let k = 0; k < 40; k++) world.step(1 / 60);
      });
    for (let k = 0; k < 120; k++) world.step(1 / 60);
  };

  /** The list as another device left it. Creatures are a view of tasks, so
   * the view catches up: gone ones leave at once, new ones drop in (or form
   * a pile, if the jar was empty), renamed ones change their label. */
  const applyRemote = (next: Task[]) => {
    const t = Date.now();
    const prev = tasksRef.current;
    const nextIds = new Set(next.map((x) => x.id));
    for (const task of prev) {
      if (nextIds.has(task.id)) continue;
      const b = blobOf.current.get(task.id);
      if (b !== undefined) world.remove(b);
      blobOf.current.delete(task.id);
    }
    tasksRef.current = next;
    setTasksState(next);
    const radii = fitRadii(next, t);
    const fresh = next.filter((x) => !blobOf.current.has(x.id));
    if (world.blobs.length === 0) buildPile(fresh, radii);
    else
      for (const task of fresh) {
        const r = radii.get(task.id)!;
        const id = scene.current?.dropIn(task.title, task.color, r);
        if (id !== undefined && id !== null) blobOf.current.set(task.id, id);
      }
    for (const task of next) {
      const blob = world.blobs.find((b) => b.id === blobOf.current.get(task.id));
      if (blob && blob.title !== task.title) blob.title = task.title;
    }
    resize();
    setModal((m) => (m && "id" in m && !nextIds.has(m.id) ? null : m));
  };

  useEffect(() => {
    let disposed = false;
    const t = Date.now();
    const loaded = store.load() ?? demoTasks(t);
    tasksRef.current = loaded;
    setTasksState(loaded);
    if (!store.load()) store.save(loaded);
    if (world.blobs.length === 0) buildPile(loaded, fitRadii(loaded, t));
    const unsubscribe = store.subscribe?.(applyRemote);
    const moodOf = (b: Blob): FaceMood => {
      const entry = [...blobOf.current].find(([, id]) => id === b.id);
      const task = entry && tasksRef.current.find((x) => x.id === entry[0]);
      return task ? mood(task, Date.now()) : "awake";
    };
    mountScene(host.current!, world, {
      interactive: false,
      moodOf,
      onTap: (id) => {
        const entry = [...blobOf.current].find(([, b]) => b === id);
        if (entry) setModal({ kind: "task", id: entry[0] });
      },
    })
      .then((c) => {
        if (disposed) return c.destroy();
        scene.current = c;
      })
      .catch(() =>
        setError(
          "The jar couldn’t start WebGL. Try a browser with hardware acceleration enabled.",
        ),
      );
    const timer = setInterval(resize, 2000);
    const wake = () => !document.hidden && resize();
    document.addEventListener("visibilitychange", wake);
    return () => {
      disposed = true;
      unsubscribe?.();
      scene.current?.destroy();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, store]);

  const current = modal && "id" in modal ? tasks.find((t) => t.id === modal.id) : undefined;

  const setFree = (task: Task) => {
    const blob = blobOf.current.get(task.id);
    if (blob !== undefined) scene.current?.setFree(blob);
    blobOf.current.delete(task.id);
    setTasks(tasksRef.current.filter((t) => t.id !== task.id));
    setModal(null);
    say("Set free. A little room comes back.", () => {
      const next = [...tasksRef.current, task];
      setTasks(next);
      const r = fitRadii(next, Date.now()).get(task.id)!;
      const id = scene.current?.dropIn(task.title, task.color, r);
      if (id) blobOf.current.set(task.id, id);
      setToast(null);
    });
  };

  const split = (task: Task, titles: string[]) => {
    const t = Date.now();
    const children = splitTask(task, titles, t);
    if (children.length < 2) return;
    const next = [
      ...tasksRef.current.filter((x) => x.id !== task.id),
      ...children,
    ];
    const radii = fitRadii(next, t);
    const parent = blobOf.current.get(task.id);
    blobOf.current.delete(task.id);
    if (parent !== undefined && scene.current) {
      const ids = scene.current.split(
        parent,
        children.map((c) => ({
          title: c.title,
          color: c.color,
          radius: radii.get(c.id)!,
        })),
      );
      ids.forEach((id, i) => blobOf.current.set(children[i].id, id));
    }
    setTasks(next);
    setModal(null);
    resize();
    say(`Split into ${children.length} smaller things.`);
  };

  const save = (task: Task, title: string, deadline: number | null) => {
    const next = tasksRef.current.map((t) =>
      t.id === task.id ? { ...t, title: title.trim() || t.title, deadline } : t,
    );
    setTasks(next);
    const blob = world.blobs.find((b) => b.id === blobOf.current.get(task.id));
    if (blob) blob.title = title.trim() || task.title;
    resize();
    setModal({ kind: "task", id: task.id });
  };

  const add = (title: string, deadline: number | null) => {
    const t = Date.now();
    const task = createTask(title, deadline, t, colorFor(tasksRef.current.length + Math.floor(t / 1000)));
    const next = [...tasksRef.current, task];
    const r = fitRadii(next, t).get(task.id)!;
    const id = scene.current?.dropIn(task.title, task.color, r);
    if (id) blobOf.current.set(task.id, id);
    setTasks(next);
    resize();
    setModal(null);
    say(deadline === null ? "Dropped in. It’ll grow a little each hour." : "Dropped in, and off to sleep until it’s due.");
  };

  /** Debug: a random creature, free or deadlined (past or future). */
  const debugAdd = () => {
    const t = Date.now();
    const roll = Math.random();
    const deadline =
      roll < 0.34
        ? null
        : roll < 0.67
          ? t + (1 + Math.random() * 72) * HOUR // future: asleep
          : t - (1 + Math.random() * 48) * HOUR; // passed: uncomfortable
    const ageHours = Math.random() * 120;
    const task: Task = {
      ...createTask(
        `Debug ${tasksRef.current.length + 1}`,
        deadline,
        t,
        colorFor(Math.floor(Math.random() * 6)),
      ),
      createdAt: t - ageHours * HOUR,
    };
    const next = [...tasksRef.current, task];
    const r = fitRadii(next, t).get(task.id)!;
    const id = scene.current?.dropIn(task.title, task.color, r);
    if (id) blobOf.current.set(task.id, id);
    setTasks(next);
    resize();
  };

  /** Debug: age a random handful of creatures so they earn a few sizes.
   * Shifts `createdAt` rather than the physics target, so the resize tick
   * keeps the growth instead of easing it back. */
  const debugGrow = () => {
    const shuffled = [...tasksRef.current].sort(() => Math.random() - 0.5);
    const count = 1 + Math.floor(Math.random() * shuffled.length);
    const steps = 2 + Math.floor(Math.random() * 3);
    const chosen = new Set(shuffled.slice(0, count).map((t) => t.id));
    setTasks(
      tasksRef.current.map((t) =>
        chosen.has(t.id) ? { ...t, createdAt: t.createdAt - steps * 12 * HOUR } : t,
      ),
    );
    resize();
    say(`Grew ${count} by ${steps} steps.`);
  };

  /** Debug: an empty jar, at once. */
  const debugClear = () => {
    for (const id of [...blobOf.current.values()]) world.remove(id);
    blobOf.current.clear();
    setTasks([]);
    setModal(null);
    say("Cleared.");
  };

  const sorted = useMemo(
    () => [...tasks].sort((a, b) => a.createdAt - b.createdAt),
    [tasks],
  );

  return (
    <div className="jar-screen">
      <div className="stage">
        <div className="canvas-host" ref={host}>
          {error && <p role="alert">{error}</p>}
        </div>
      </div>
      <div className="bar bottom">
        <button
          className="bar-button"
          onClick={() => setModal({ kind: "list" })}
          aria-label="All the things on your mind"
        >
          ≡ <span>{tasks.length}</span>
        </button>
        <button
          className="bar-button small"
          onClick={debugAdd}
          aria-label="Debug: add random"
        >
          +?
        </button>
        <button
          className="bar-button small"
          onClick={debugGrow}
          aria-label="Debug: grow random"
        >
          ↗?
        </button>
        <button
          className="bar-button small"
          onClick={debugClear}
          aria-label="Debug: clear all"
        >
          ✕?
        </button>
        <span className="bar-caption" role="status">
          {toast ? (
            <>
              {toast.text}
              {toast.undo && (
                <button className="undo" onClick={toast.undo}>
                  Undo
                </button>
              )}
            </>
          ) : tasks.length ? (
            "Tap a little one."
          ) : (
            "All clear. Take a breath."
          )}
        </span>
        <button
          className="bar-button add"
          onClick={() => setModal({ kind: "add" })}
          aria-label="Drop something in"
        >
          +
        </button>
      </div>

      <Sheet
        open={modal?.kind === "task" && !!current}
        onClose={() => setModal(null)}
        label="Task"
      >
        {current && (
          <>
            <span className="eyebrow">{MOOD_LABEL[mood(current, now)].toUpperCase()}</span>
            <h2>{current.title}</h2>
            <p className="meta">{describe(current, now)}</p>
            <p className="meta faint">
              On your mind since {formatMoment(current.createdAt)},{" "}
              {relative(current.createdAt, now)}.
            </p>
            <div className="sheet-actions">
              <button onClick={() => setModal({ kind: "edit", id: current.id })}>
                Edit
              </button>
              <button onClick={() => setModal({ kind: "split", id: current.id })}>
                Split ✂
              </button>
              <button className="primary" onClick={() => setFree(current)}>
                Set free ✓
              </button>
            </div>
          </>
        )}
      </Sheet>

      <Sheet
        open={modal?.kind === "edit" && !!current}
        onClose={() => setModal(current ? { kind: "task", id: current.id } : null)}
        label="Edit task"
      >
        {current && (
          <TaskForm
            key={current.id}
            heading="A little edit"
            task={current}
            submit="Save"
            onSubmit={(title, deadline) => save(current, title, deadline)}
          />
        )}
      </Sheet>

      <Sheet
        open={modal?.kind === "add"}
        onClose={() => setModal(null)}
        label="New task"
      >
        {modal?.kind === "add" && (
          <TaskForm
            heading="Something on your mind?"
            submit="Drop it in"
            onSubmit={add}
          />
        )}
      </Sheet>

      <Sheet
        open={modal?.kind === "split" && !!current}
        onClose={() => setModal(current ? { kind: "task", id: current.id } : null)}
        label="Split task"
      >
        {current && modal?.kind === "split" && (
          <SplitForm key={current.id} task={current} onSplit={(titles) => split(current, titles)} />
        )}
      </Sheet>

      <Sheet
        open={modal?.kind === "list"}
        onClose={() => setModal(null)}
        label="All tasks"
        className="tall"
      >
        <span className="eyebrow">EVERYTHING ON YOUR MIND</span>
        <h2>{tasks.length ? `${tasks.length} little things` : "Nothing at all"}</h2>
        <div className="task-list">
          {sorted.map((t) => (
            <button
              key={t.id}
              className="task"
              onClick={() => setModal({ kind: "task", id: t.id })}
            >
              <span className="mini-blob" style={{ background: t.color }}>
                {{ asleep: "‿ ‿", uncomfortable: "› ‹", sheepish: "ı ı", awake: "• •" }[mood(t, now)]}
              </span>
              <span>
                {t.title}
                <small>
                  {t.deadline === null
                    ? `Since ${relative(t.createdAt, now)}`
                    : mood(t, now) === "asleep"
                      ? `Due ${relative(t.deadline, now)}`
                      : `Was due ${relative(t.deadline, now)}`}
                </small>
              </span>
              <span className="task-arrow">↗</span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function TaskForm({
  heading,
  task,
  submit,
  onSubmit,
}: {
  heading: string;
  task?: Task;
  submit: string;
  onSubmit: (title: string, deadline: number | null) => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [date, setDate] = useState(task?.deadline ? toInputDate(task.deadline) : "");
  const [time, setTime] = useState(task?.deadline ? toInputTime(task.deadline) : "");
  const deadline = fromInputs(date, time);
  return (
    <form
      className="task-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onSubmit(title, deadline);
      }}
    >
      <span className="eyebrow">{task ? "EDIT" : "NEW"}</span>
      <h2>{heading}</h2>
      <label>
        What is it?
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="A little thing…"
          required
        />
      </label>
      <div className="deadline-fields">
        <label>
          Deadline <small>dd/mm/yyyy</small>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Time <small>24h</small>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={!date}
          />
        </label>
      </div>
      <p className="meta faint">
        {deadline === null
          ? "No deadline: it stays awake and grows a little every hour."
          : `It’ll sleep until ${formatMoment(deadline)}, growing as the time gets used up.`}
        {date && (
          <>
            {" "}
            <button
              type="button"
              className="link"
              onClick={() => {
                setDate("");
                setTime("");
              }}
            >
              Remove deadline
            </button>
          </>
        )}
      </p>
      <div className="sheet-actions">
        <button className="primary" type="submit">
          {submit}
        </button>
      </div>
    </form>
  );
}

function SplitForm({
  task,
  onSplit,
}: {
  task: Task;
  onSplit: (titles: string[]) => void;
}) {
  const [parts, setParts] = useState(["", ""]);
  const [confirming, setConfirming] = useState(false);
  const filled = parts.map((p) => p.trim()).filter(Boolean);
  if (confirming)
    return (
      <div className="split-confirm">
        <span className="eyebrow">ONE BIG THING, {filled.length} SMALL STEPS</span>
        <h2>Split “{task.title}”?</h2>
        <ol>
          {filled.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
        <p className="meta faint">
          The big one goes. These start small
          {task.deadline !== null && task.deadline > Date.now()
            ? " and share its deadline."
            : "."}
        </p>
        <div className="sheet-actions">
          <button type="button" onClick={() => setConfirming(false)}>
            Back
          </button>
          <button className="primary" type="button" onClick={() => onSplit(filled)}>
            Split it ✂
          </button>
        </div>
      </div>
    );
  return (
    <form
      className="task-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (filled.length >= 2) setConfirming(true);
      }}
    >
      <span className="eyebrow">SPLIT</span>
      <h2>Smaller steps</h2>
      <p className="meta">
        “{task.title}” is a lot. What would it be as a few small things?
      </p>
      {parts.map((p, i) => (
        <label key={i} className="part">
          <span>{i + 1}</span>
          <input
            autoFocus={i === 0}
            value={p}
            onChange={(e) =>
              setParts(parts.map((x, j) => (j === i ? e.target.value : x)))
            }
            maxLength={80}
            placeholder={i === 0 ? "First small step…" : "Then…"}
            aria-label={`Step ${i + 1}`}
          />
          {parts.length > 2 && (
            <button
              type="button"
              className="link"
              aria-label={`Remove step ${i + 1}`}
              onClick={() => setParts(parts.filter((_, j) => j !== i))}
            >
              ×
            </button>
          )}
        </label>
      ))}
      <button
        type="button"
        className="link add-part"
        onClick={() => setParts([...parts, ""])}
        disabled={parts.length >= 8}
      >
        + one more
      </button>
      <div className="sheet-actions">
        <button className="primary" type="submit" disabled={filled.length < 2}>
          Continue
        </button>
      </div>
    </form>
  );
}
