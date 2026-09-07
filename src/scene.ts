import { Application, Graphics } from "pixi.js";
import {
  World,
  WIDTH,
  HEIGHT,
  LEFT,
  RIGHT,
  FLOOR,
  TOP,
  center,
} from "./physics";
import type { Blob } from "./physics";

/** Contact pressure above which a creature squints. Calibrated against the
 * north star: nobody squints in the settled or crowded jars, the ones pressed
 * against the walls and each other in the squished jar do. */
export const SQUEEZED = 2.5;

/** What a face shows. `auto` is the playground's physical vocabulary
 * (pressure squints, sheepishness after growing). The app decides moods
 * from the task instead: awake creatures just blink, sleeping ones wait for
 * their deadline, uncomfortable ones are past it. `happy` is only ever worn
 * by a creature on its way out. */
export type Mood =
  | "auto"
  | "awake"
  | "sheepish"
  | "asleep"
  | "uncomfortable"
  | "happy";

export type SceneOptions = {
  /** Dragging. Off in the app, where a touch is a tap that opens the task. */
  interactive: boolean;
  moodOf?: (b: Blob) => Mood;
  /** Playground: the selection changed by pointer. */
  onSelect?: () => void;
  /** App: a creature was tapped. */
  onTap?: (id: number) => void;
};

const INK = 0x48413e,
  FACE = 0x393536,
  BLUSH = 0xc78899,
  CREAM = 0xfff7e6;

type Ghost = {
  points: { x: number; y: number }[];
  cx: number;
  cy: number;
  radius: number;
  color: string;
  kind: "free" | "pop";
  t0: number;
};
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  drift: number;
  life: number;
  age: number;
  size: number;
  color: string | number;
};
type Ripple = { x: number; y: number; r0: number; t0: number; color: string };

const FREE_DURATION = 1.7,
  POP_DURATION = 0.42;

export async function mountScene(
  host: HTMLElement,
  world: World,
  options: SceneOptions,
) {
  const app = new Application();
  await app.init({
    width: WIDTH,
    height: HEIGHT,
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(devicePixelRatio, 2),
    autoDensity: true,
    preference: "webgl",
  });
  host.appendChild(app.canvas);
  app.canvas.setAttribute(
    "aria-label",
    options.interactive
      ? "Interactive blob jar. Drag a creature, or use the buttons alongside it."
      : "Your jar. Tap a creature to open it, or use the list button.",
  );
  // Fit the phone-shaped canvas inside whatever room the layout gives it.
  const fit = () => {
    const parent = host.parentElement;
    if (!parent) return;
    const w = Math.min(
      parent.clientWidth,
      (parent.clientHeight * WIDTH) / HEIGHT,
    );
    host.style.width = `${w}px`;
    host.style.height = `${(w * HEIGHT) / WIDTH}px`;
  };
  fit();
  const observer = new ResizeObserver(fit);
  if (host.parentElement) observer.observe(host.parentElement);

  const g = new Graphics();
  app.stage.addChild(g);
  let elapsed = 0,
    previous = performance.now(),
    clock = 0,
    paused = false,
    destroyed = false;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ghosts: Ghost[] = [],
    particles: Particle[] = [],
    ripples: Ripple[] = [];

  const outline = (
    p: { x: number; y: number }[],
    cx = 0,
    cy = 0,
    scale = 1,
    dx = 0,
    dy = 0,
  ) => {
    const n = p.length;
    const at = (i: number) => ({
      x: cx + (p[i].x - cx) * scale + dx,
      y: cy + (p[i].y - cy) * scale + dy,
    });
    // Quadratic midpoint curve stays inside the collision polygon's convex corners.
    const last = at(n - 1),
      first = at(0);
    g.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
    for (let i = 0; i < n; i++) {
      const a = at(i),
        b = at((i + 1) % n);
      g.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    g.closePath();
  };

  const faceStroke = { color: FACE, width: 2.3, cap: "round", join: "round" } as const;

  /** Eyes, and whatever else the mood calls for, around a centre. */
  const face = (
    c: { x: number; y: number },
    radius: number,
    mood: Mood,
    seed: number,
    alpha = 1,
    extras = true,
  ) => {
    const size = Math.max(2.5, Math.min(6, 3 * Math.sqrt(radius / 45))),
      spacing = size * 3.8;
    const cy = c.y + Math.min(radius * 0.1, 10);
    const blink =
      mood !== "asleep" &&
      !reduced &&
      Math.sin(world.time * 0.85 + seed * 2.4) > 0.996;
    const stroke = { ...faceStroke, alpha };
    // Sheepish: tall `ı ı` pupils, blush, one nervous drop. The playground
    // earns it by growing; the app hands it to free creatures that linger.
    const sheepish = mood === "sheepish" || (mood === "auto" && extras);
    for (const side of [-1, 1]) {
      const x = c.x + (side * spacing) / 2;
      if (mood === "uncomfortable") {
        g.moveTo(x + side * size * 0.6, cy - size)
          .lineTo(x - side * size * 0.6, cy)
          .lineTo(x + side * size * 0.6, cy + size)
          .stroke({ ...stroke, width: 2.4 });
      } else if (mood === "asleep") {
        // Closed, at rest: a soft curve that dips in the middle.
        g.moveTo(x - size * 0.9, cy - size * 0.25)
          .quadraticCurveTo(x, cy + size * 0.75, x + size * 0.9, cy - size * 0.25)
          .stroke({ ...stroke, width: 2.1 });
      } else if (mood === "happy") {
        // Closed, delighted: the curve arches up.
        g.moveTo(x - size * 0.9, cy + size * 0.3)
          .quadraticCurveTo(x, cy - size * 0.95, x + size * 0.9, cy + size * 0.3)
          .stroke({ ...stroke, width: 2.2 });
      } else if (blink) {
        g.moveTo(x - size * 0.6, cy)
          .lineTo(x + size * 0.6, cy)
          .stroke(stroke);
      } else
        g.ellipse(
          x,
          cy,
          size * 0.48,
          sheepish ? size * 1.6 : size * 0.88,
        ).fill({ color: FACE, alpha });
    }
    if (mood === "happy") {
      g.moveTo(c.x - size * 0.9, cy + size * 1.9)
        .quadraticCurveTo(c.x, cy + size * 3.1, c.x + size * 0.9, cy + size * 1.9)
        .stroke({ ...stroke, width: 2 });
    }
    if (mood === "uncomfortable" || sheepish) {
      // Blush for both; the nervous drop is sheepishness only.
      for (const side of [-1, 1])
        g.ellipse(
          c.x + side * spacing * 0.85,
          cy + size * 2.7,
          size * 1.7,
          size * 0.75,
        ).fill({ color: BLUSH, alpha: 0.2 * alpha });
      if (sheepish) {
        const x = c.x + spacing * 1.5,
          y = cy + size;
        g.moveTo(x, y)
          .quadraticCurveTo(x - 5, y + 12, x, y + 13)
          .quadraticCurveTo(x + 5, y + 12, x, y)
          .stroke({ color: CREAM, width: 1.6, alpha });
      }
    }
    if (mood === "asleep") zzz(c, cy, size, spacing, seed);
  };

  /** Three little z's drift up from a sleeping creature every few seconds. */
  const zzz = (
    c: { x: number; y: number },
    cy: number,
    size: number,
    spacing: number,
    seed: number,
  ) => {
    const z = (x: number, y: number, s: number, alpha: number) =>
      g
        .moveTo(x, y)
        .lineTo(x + s, y)
        .lineTo(x, y + s)
        .lineTo(x + s, y + s)
        .stroke({ color: FACE, width: 1.5, alpha, cap: "round", join: "round" });
    const baseX = c.x + spacing * 1.15,
      baseY = cy - size * 2.2;
    if (reduced) {
      z(baseX, baseY - 6, size * 1.1, 0.45);
      return;
    }
    const period = 6.5,
      phase = (clock + seed * 1.37) % period;
    for (let k = 0; k < 3; k++) {
      const start = k * 0.6,
        length = 2.4;
      if (phase < start || phase > start + length) continue;
      const u = (phase - start) / length;
      const alpha = Math.sin(u * Math.PI) * 0.75;
      z(
        baseX + k * 6 + Math.sin(u * 5 + k) * 2.5,
        baseY - u * 26 - k * 7,
        size * (0.9 + k * 0.28),
        alpha,
      );
    }
  };

  const drawJar = () => {
    // A single open vessel; the floor matches the simulation bounds.
    g.moveTo(LEFT + 8, TOP - 2)
      .quadraticCurveTo(LEFT, TOP + 1, LEFT, TOP + 14)
      .lineTo(LEFT, FLOOR - 22)
      .quadraticCurveTo(LEFT, FLOOR, LEFT + 23, FLOOR)
      .lineTo(RIGHT - 23, FLOOR)
      .quadraticCurveTo(RIGHT, FLOOR, RIGHT, FLOOR - 22)
      .lineTo(RIGHT, TOP + 14)
      .quadraticCurveTo(RIGHT, TOP + 1, RIGHT - 8, TOP - 2)
      .stroke({ color: INK, width: 2.4 });
  };

  const drawGhost = (ghost: Ghost) => {
    const t = clock - ghost.t0;
    if (ghost.kind === "pop") {
      // A quick swell and it is gone: the moment of splitting.
      const u = Math.min(1, t / POP_DURATION);
      const scale = 1 + 0.22 * Math.sin(u * Math.PI * 0.5),
        alpha = (1 - u) ** 1.5;
      outline(ghost.points, ghost.cx, ghost.cy, scale);
      g.fill({ color: ghost.color, alpha: alpha * 0.9 }).stroke({
        color: INK,
        width: 1.7,
        alpha,
      });
      return;
    }
    // Set free: a breath in, then it drifts up and out of the jar's mouth.
    const u = Math.min(1, t / FREE_DURATION);
    const hold = 0.17;
    const puff = u < hold ? 1 + 0.1 * Math.sin((u / hold) * Math.PI) : 1;
    const rise = u < hold ? 0 : ((u - hold) / (1 - hold)) ** 1.5;
    const dy = reduced ? 0 : -rise * (ghost.cy - TOP + ghost.radius * 1.4);
    const dx = reduced ? 0 : Math.sin(rise * 7) * 7 * rise;
    const scale = puff * (1 - 0.3 * rise);
    const alpha = reduced
      ? 1 - u
      : u < 0.65
        ? 1
        : 1 - ((u - 0.65) / 0.35) ** 1.2;
    outline(ghost.points, ghost.cx, ghost.cy, scale, dx, dy);
    g.fill({ color: ghost.color, alpha }).stroke({
      color: INK,
      width: 1.7,
      alpha,
    });
    face(
      { x: ghost.cx + dx, y: ghost.cy + dy },
      ghost.radius * scale,
      "happy",
      0,
      alpha,
    );
  };

  const draw = () => {
    g.clear();
    drawJar();
    for (const b of world.blobs) {
      outline(b.points);
      g.fill(b.color).stroke({
        color: INK,
        width: world.selected === b.id ? 2.7 : 1.7,
      });
      const c = center(b);
      const mood = options.moodOf?.(b) ?? "auto";
      if (mood === "auto") {
        const guilty = b.radius / b.base > 1.22;
        const squeezed = b.pressure > SQUEEZED && !guilty;
        face(
          c,
          b.radius,
          squeezed ? "uncomfortable" : "auto",
          b.id,
          1,
          guilty,
        );
      } else face(c, b.radius, mood, b.id);
    }
    for (const ghost of ghosts) drawGhost(ghost);
    for (const r of ripples) {
      const u = Math.min(1, (clock - r.t0) / 0.7);
      g.circle(r.x, r.y, r.r0 * (1 + 1.3 * u)).stroke({
        color: r.color,
        width: 2.5 * (1 - u) + 0.5,
        alpha: (1 - u) * 0.55,
      });
    }
    for (const p of particles) {
      const u = p.age / p.life;
      g.circle(p.x, p.y, p.size * (1 - u * 0.6)).fill({
        color: p.color,
        alpha: (1 - u) * 0.9,
      });
    }
  };

  const animate = (dt: number) => {
    clock += dt;
    for (let i = ghosts.length - 1; i >= 0; i--)
      if (
        clock - ghosts[i].t0 >
        (ghosts[i].kind === "pop" ? POP_DURATION : FREE_DURATION)
      )
        ghosts.splice(i, 1);
    for (let i = ripples.length - 1; i >= 0; i--)
      if (clock - ripples[i].t0 > 0.7) ripples.splice(i, 1);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age > p.life) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += p.drift * dt;
      p.vx *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  };

  const tick = () => {
    const time = performance.now();
    const dt = Math.min(0.05, (time - previous) / 1000);
    if (!paused && !document.hidden) {
      elapsed += dt;
      while (elapsed >= 1 / 60) {
        world.step(1 / 60);
        elapsed -= 1 / 60;
      }
    }
    if (!document.hidden) animate(dt);
    previous = time;
    draw();
    app.render();
    const busy = ghosts.length + particles.length + ripples.length > 0;
    timer = window.setTimeout(
      tick,
      document.hidden || (paused && !busy) ? 200 : 16,
    );
  };
  // Drive rendering ourselves, so a hidden or paused page costs nothing.
  app.ticker.stop();
  let timer = window.setTimeout(tick, 0);

  const position = (e: PointerEvent) => {
    const r = app.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * WIDTH) / r.width,
      y: ((e.clientY - r.top) * HEIGHT) / r.height,
    };
  };
  let pointer: number | null = null;
  let press: { x: number; y: number; id: number } | null = null;
  const down = (e: PointerEvent) => {
    if (pointer !== null) return;
    const p = position(e),
      b = world.hit(p.x, p.y);
    if (!b) return;
    pointer = e.pointerId;
    world.selected = b.id;
    if (options.interactive) {
      world.drag = { id: b.id, ...p };
      app.canvas.setPointerCapture(e.pointerId);
      options.onSelect?.();
    } else press = { x: e.clientX, y: e.clientY, id: b.id };
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== pointer || !world.drag) return;
    const p = position(e);
    world.drag.x = Math.max(LEFT + 15, Math.min(RIGHT - 15, p.x));
    world.drag.y = Math.max(TOP + 20, Math.min(FLOOR - 10, p.y));
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    world.drag = null;
    if (press && e.type === "pointerup") {
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      if (moved < 12 && world.blobs.some((b) => b.id === press!.id))
        options.onTap?.(press.id);
    }
    press = null;
  };
  app.canvas.addEventListener("pointerdown", down);
  app.canvas.addEventListener("pointermove", move);
  app.canvas.addEventListener("pointerup", up);
  app.canvas.addEventListener("pointercancel", up);
  app.canvas.addEventListener("lostpointercapture", up);

  const burst = (
    x: number,
    y: number,
    radius: number,
    color: string,
    kind: "free" | "pop",
    count: number,
  ) => {
    if (reduced) return;
    for (let i = 0; i < count; i++) {
      const a = kind === "free" ? -Math.PI / 2 + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2;
      const speed = kind === "free" ? 60 + Math.random() * 110 : 90 + Math.random() * 160;
      const r = radius * (kind === "free" ? 0.5 + Math.random() * 0.5 : 0.3 + Math.random() * 0.6);
      particles.push({
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        drift: kind === "free" ? -70 : 260,
        life: 0.8 + Math.random() * 0.7,
        age: 0,
        size: 2 + Math.random() * 3.5,
        color: Math.random() < 0.45 ? CREAM : color,
      });
    }
  };

  return {
    setPaused(value: boolean) {
      paused = value;
      elapsed = 0;
      previous = performance.now();
    },
    /** Completion. The creature takes a happy breath, leaves the pile at
     * once (so everything above it settles into the room), and floats up out
     * of the jar with a few sparks, while a soft ring marks the gap. */
    setFree(id: number) {
      const b = world.blobs.find((b) => b.id === id);
      if (!b) return false;
      const c = center(b);
      ghosts.push({
        points: b.points.map((p) => ({ x: p.x, y: p.y })),
        cx: c.x,
        cy: c.y,
        radius: b.radius,
        color: b.color,
        kind: "free",
        t0: clock,
      });
      ripples.push({ x: c.x, y: c.y, r0: b.radius, t0: clock, color: b.color });
      burst(c.x, c.y, b.radius, b.color, "free", 14);
      world.remove(id);
      return true;
    },
    /** Splitting. The creature pops, and its pieces tumble out from where it
     * was, small, then inflate to their own sizes. */
    split(
      id: number,
      children: { title: string; color: string; radius: number }[],
    ) {
      const b = world.blobs.find((b) => b.id === id);
      if (!b) return [];
      const c = center(b);
      ghosts.push({
        points: b.points.map((p) => ({ x: p.x, y: p.y })),
        cx: c.x,
        cy: c.y,
        radius: b.radius,
        color: b.color,
        kind: "pop",
        t0: clock,
      });
      burst(c.x, c.y, b.radius, b.color, "pop", 10);
      world.remove(id);
      const ids: number[] = [];
      children.forEach((child, i) => {
        const a = -Math.PI / 2 + ((i + 0.5) / children.length) * Math.PI * 2;
        const spread = Math.max(6, b.radius * 0.35);
        const x = Math.max(
          LEFT + child.radius + 4,
          Math.min(RIGHT - child.radius - 4, c.x + Math.cos(a) * spread),
        );
        const y = Math.max(
          TOP + child.radius + 4,
          Math.min(FLOOR - child.radius - 4, c.y + Math.sin(a) * spread),
        );
        const blob = world.add(child.title, x, y, child.radius, child.color);
        if (!blob) return;
        world.shrinkTo(blob.id, 0.4);
        if (!reduced) world.nudge(blob.id, Math.cos(a) * 3.5, Math.sin(a) * 3.5 - 2);
        ids.push(blob.id);
      });
      return ids;
    },
    /** A newcomer drops in from the top, small, and inflates. */
    dropIn(title: string, color: string, radius: number, x?: number) {
      const px =
        x ??
        LEFT + radius + 12 + Math.random() * (RIGHT - LEFT - 2 * radius - 24);
      const blob = world.add(title, px, TOP + radius + 6, radius, color);
      if (!blob) return null;
      world.shrinkTo(blob.id, 0.55);
      return blob.id;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(timer);
      observer.disconnect();
      app.destroy(true, { children: true });
    },
  };
}
export type SceneController = Awaited<ReturnType<typeof mountScene>>;
