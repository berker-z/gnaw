/** The jar is a phone screen: 9:16, so it fills a handset with only a thin
 * bar above and below, and on a desktop it sits in a phone-shaped frame. A
 * pile in it has to stack rather than spread out in a row along the floor. */
export const WIDTH = 450,
  HEIGHT = 800,
  FLOOR = 770,
  LEFT = 26,
  RIGHT = 424,
  TOP = 40;
export const JAR_AREA = (RIGHT - LEFT) * (FLOOR - TOP);
/** Fraction of the jar the cast may occupy: the north star's third panel. */
export const CAPACITY = 0.96;
/** A sanity guard only, far above practical use. Contacts cost O(n²) per
 * iteration, so a jar this full will drop frames on a phone; the app's fill
 * rule (everyone shrinks to fit) is what actually bounds the crowd. */
export const MAX_BLOBS = 64;
export const PALETTE = [
  "#cbb3c5",
  "#bcc7af",
  "#b9bad4",
  "#edc2ae",
  "#eee3c8",
  "#d9b9ca",
];
/** Boundary vertices per creature. Large bodies need enough resolution to wrap
 * around small neighbours; 36 keeps contact cost affordable. */
export const N = 36;
/** Material tuning. Exported so experiments can override without edits. */
export const TUNE = {
  /** Retention curve: (retBase / radius) ^ retPow, clamped to [retMin, 1]. */
  retBase: 40,
  retPow: 2.5,
  retMin: 0.03,
  /** Skin smoothing per iteration, at retention 1 and at retention 0. Kept
   * light: the lips of a wrap are free vertices, and smoothing pulls them
   * straight, which lifts small neighbours back out of the big body. */
  smooth0: 0.02,
  smooth1: 0.01,
  /** Outline budget above rest length, at retention 1 and at retention 0. */
  stretch0: 0.02,
  stretch1: 0.16,
  /** Memory foam: how fast the remembered shape creeps toward the current
   * shape (scaled by softness), and how fast it recovers toward round when
   * the body is under load (scaled by firmness) or free. Per step. */
  creep: 0.3,
  recoverLoaded: 0.004,
  recoverFree: 0.03,
  /** Hydrostatic drape: per-step outward push at the deepest point of a fully
   * soft body, in pixels. The area constraint turns this into flow. */
  flow: 1.2,
  /** Largest allowed ratio of a body's principal axes, at retention 1 and at
   * retention 0, and the fraction of the excess corrected per iteration. */
  aspect0: 1.12,
  aspect1: 1.35,
  aspectRate: 0.25,
  /** Contact mass = (radius / 60) ^ massPow. A body's whole-body share of a
   * contact is 1/mass; its local dent share is dent * softness. */
  massPow: 2,
  dent: 12,
  /** Protected interior radius as a fraction of radius: base + scale*retention. */
  coreBase: 0.3,
  coreRet: 0.55,
};
/** A boundary vertex: position, previous position, and how much it has been
 * in contact recently (0 to 1). Contact vertices are left alone by the skin
 * smoothing so a body can wrap tightly around whatever is pressing on it. */
export type Point = {
  x: number;
  y: number;
  px: number;
  py: number;
  contact: number;
};
export type Blob = {
  id: number;
  title: string;
  color: string;
  points: Point[];
  /** True rest shape, normalised to unit radius. Never changes. */
  rest: { x: number; y: number }[];
  /** Remembered shape: what the body currently springs back toward. Creeps
   * toward the present shape under load and recovers toward `rest`. */
  memory: { x: number; y: number }[];
  radius: number;
  target: number;
  base: number;
  pressure: number;
  removing: boolean;
};
export const center = (b: Blob) => ({
  x: b.points.reduce((s, p) => s + p.x, 0) / b.points.length,
  y: b.points.reduce((s, p) => s + p.y, 0) / b.points.length,
});
export function inside(
  x: number,
  y: number,
  points: { x: number; y: number }[],
) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (
      a.y > y !== b.y > y &&
      x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
    )
      hit = !hit;
  }
  return hit;
}
const polygonArea = (points: { x: number; y: number }[]) =>
  points.reduce((s, p, i) => {
    const q = points[(i + 1) % points.length];
    return s + p.x * q.y - q.x * p.y;
  }, 0) / 2;
export function area(b: Blob) {
  return polygonArea(b.points);
}
/** Material identity: how strongly a body remembers its round rest shape.
 * Small creatures are dense little cushions. Softness starts well below the
 * medium sizes so mid-sized bodies already flatten against their neighbours,
 * and the large ones behave like firm balloons: fixed bulk, a limited skin,
 * and a shape memory that gives way under sustained load. */
export const shapeRetention = (radius: number) =>
  Math.max(TUNE.retMin, Math.min(1, (TUNE.retBase / radius) ** TUNE.retPow));
/** Skin budget: how much longer than its rest outline a body may become.
 * A rounded rectangle needs roughly 8 percent more outline than a circle of
 * the same area; wrapping a small neighbour needs a little more. */
export const perimeterStretch = (retention: number) =>
  TUNE.stretch0 + (TUNE.stretch1 - TUNE.stretch0) * (1 - retention);
const coreRadius = (b: Blob) =>
  b.radius * (TUNE.coreBase + TUNE.coreRet * shapeRetention(b.radius));
const mass = (b: Blob) => (b.radius / 60) ** TUNE.massPow;
type Box = { x0: number; y0: number; x1: number; y1: number };
const bounds = (b: Blob): Box => {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const p of b.points) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
};
/** Rotation that best aligns the remembered shape with the current outline. */
const orientation = (b: Blob, c: { x: number; y: number }) => {
  let cross = 0,
    dot = 0;
  b.points.forEach((p, i) => {
    const r = b.memory[i];
    dot += r.x * (p.x - c.x) + r.y * (p.y - c.y);
    cross += r.x * (p.y - c.y) - r.y * (p.x - c.x);
  });
  return Math.atan2(cross, dot);
};
export class World {
  blobs: Blob[] = [];
  nextId = 1;
  /** Production settings. Full gravity and quick settling were the user's
   * preference when these were still sliders; the material itself is `TUNE`.
   * Tests set gravity to zero to study shapes without a floor. */
  gravity = 1400;
  damping = 0.95;
  selected: number | null = null;
  drag: { id: number; x: number; y: number } | null = null;
  time = 0;
  add(
    title: string,
    x = 300,
    y = 110,
    radius = 52,
    color = PALETTE[this.nextId % 6],
  ) {
    if (this.blobs.length >= MAX_BLOBS) return null;
    const id = this.nextId++;
    const rest = Array.from({ length: N }, (_, i) => {
      const a = (i / N) * Math.PI * 2;
      const r = 1 + 0.025 * Math.sin(3 * a + id);
      return { x: Math.cos(a) * r * 1.04, y: (Math.sin(a) * r) / 1.04 };
    });
    const b: Blob = {
      id,
      title,
      color,
      rest,
      memory: rest.map((p) => ({ ...p })),
      points: rest.map((p) => ({
        x: x + p.x * radius,
        y: y + p.y * radius,
        px: x + p.x * radius,
        py: y + p.y * radius,
        contact: 0,
      })),
      radius,
      target: radius,
      base: radius,
      pressure: 0,
      removing: false,
    };
    this.blobs.push(b);
    return b;
  }
  /** The three reference states, measured from the north star: each cast
   * member's equivalent radius per panel, and where it sits in the pile.
   * Heights are relative to the floor, so the drop that was tuned in the
   * shorter jar plays out the same way in the phone-shaped one. */
  static CAST: [string, number, number, [number, number, number]][] = [
    ["Water the plants", 125, 144, [125, 155, 200]],
    ["Reply to Maya", 334, 112, [74, 91, 106]],
    ["Book the dentist", 215, 268, [67, 78, 74]],
    ["Read a chapter", 53, 262, [52, 62, 61]],
    ["Take the recycling out", 267, 54, [29, 35, 43]],
    ["Go for a walk", 351, 226, [46, 48, 63]],
  ];
  preset(stage = 0) {
    this.blobs = [];
    this.nextId = 1;
    this.drag = null;
    World.CAST.forEach(([title, x, height, radii], i) =>
      this.add(title, LEFT + x, FLOOR - height, radii[0], PALETTE[i]),
    );
    this.selected = 1;
    for (let i = 0; i < 180; i++) this.step(1 / 60);
    if (stage > 0)
      this.blobs.forEach((b, i) => {
        b.target = World.CAST[i][3][stage];
        // Only the oversized one feels sheepish about how much it has grown.
        if (i) b.base = b.target;
      });
  }
  grow(id: number, factor = 1.18) {
    const b = this.blobs.find((b) => b.id === id);
    if (!b || b.removing) return false;
    const next = Math.min(200, b.target * factor);
    const occupied = this.blobs.reduce(
      (s, x) => s + Math.PI * (x === b ? next : x.target) ** 2,
      0,
    );
    if (occupied > JAR_AREA * CAPACITY) return false;
    b.target = next;
    return true;
  }
  complete(id: number) {
    const b = this.blobs.find((b) => b.id === id);
    if (b) {
      b.removing = true;
      b.target = 2;
      if (this.drag?.id === id) this.drag = null;
    }
  }
  /** Take a body out at once, so the pile above it collapses into the room
   * it leaves. The renderer keeps drawing its ghost while it floats away. */
  remove(id: number) {
    this.blobs = this.blobs.filter((b) => b.id !== id);
    if (this.drag?.id === id) this.drag = null;
    if (this.selected === id) this.selected = this.blobs[0]?.id ?? null;
  }
  /** Give a body a velocity, in pixels per step. */
  nudge(id: number, vx: number, vy: number) {
    const b = this.blobs.find((b) => b.id === id);
    if (!b) return;
    for (const p of b.points) {
      p.px = p.x - vx;
      p.py = p.y - vy;
    }
  }
  /** Start a body at a fraction of its size, so it visibly inflates. */
  shrinkTo(id: number, fraction: number) {
    const b = this.blobs.find((b) => b.id === id);
    if (!b) return;
    const c = center(b);
    b.radius = b.target * fraction;
    for (const p of b.points) {
      p.x = c.x + (p.x - c.x) * fraction;
      p.y = c.y + (p.y - c.y) * fraction;
      p.px = p.x;
      p.py = p.y;
    }
  }
  hit(x: number, y: number) {
    return [...this.blobs].reverse().find((b) => inside(x, y, b.points));
  }
  step(dt: number) {
    this.time += dt;
    for (const b of this.blobs) {
      b.radius += (b.target - b.radius) * (b.removing ? 0.1 : 0.018);
      this.remember(b);
      b.pressure *= 0.92;
      const meanVelocity = {
        x: b.points.reduce((s, p) => s + p.x - p.px, 0) / b.points.length,
        y: b.points.reduce((s, p) => s + p.y - p.py, 0) / b.points.length,
      };
      for (const p of b.points) {
        // Dampen internal wobble independently of the body's falling motion.
        const vx = Math.max(
            -8,
            Math.min(
              8,
              (meanVelocity.x + (p.x - p.px - meanVelocity.x) * 0.65) *
                this.damping,
            ),
          ),
          vy = Math.max(
            -8,
            Math.min(
              8,
              (meanVelocity.y + (p.y - p.py - meanVelocity.y) * 0.65) *
                this.damping,
            ),
          );
        p.px = p.x;
        p.py = p.y;
        p.x += vx;
        p.y += vy + this.gravity * dt * dt;
        p.contact *= 0.7;
      }
      this.drape(b);
    }
    for (let iter = 0; iter < 9; iter++) {
      for (const b of this.blobs) this.material(b);
      const boxes = this.blobs.map(bounds);
      for (let i = 0; i < this.blobs.length; i++)
        for (let j = i + 1; j < this.blobs.length; j++) {
          const a = this.blobs[i],
            b = this.blobs[j];
          if (!this.overlapping(boxes[i], boxes[j])) continue;
          const ca = center(a),
            cb = center(b);
          // A firm interior prevents containment and crossing contact edges from
          // trapping one creature inside another. The outer shell can still dent.
          const dx = cb.x - ca.x,
            dy = cb.y - ca.y;
          const distance = Math.hypot(dx, dy);
          const minimum = coreRadius(a) + coreRadius(b);
          if (distance < minimum) {
            const nx = distance > 0.001 ? dx / distance : 1;
            const ny = distance > 0.001 ? dy / distance : 0;
            const wa = 1 / mass(a),
              wb = 1 / mass(b);
            const shift = ((minimum - distance) * 0.85) / (wa + wb);
            for (const p of a.points) {
              p.x -= nx * shift * wa;
              p.y -= ny * shift * wa;
            }
            for (const p of b.points) {
              p.x += nx * shift * wb;
              p.y += ny * shift * wb;
            }
          }
          this.contacts(a, b, boxes[j]);
          this.contacts(b, a, boxes[i]);
        }
      for (const b of this.blobs) {
        const c = center(b),
          core = coreRadius(b);
        const dx = Math.max(LEFT + core, Math.min(RIGHT - core, c.x)) - c.x;
        const dy = Math.max(TOP + core, Math.min(FLOOR - core, c.y)) - c.y;
        for (const p of b.points) {
          p.x += dx;
          p.y += dy;
        }
        for (const p of b.points) {
          const x = p.x,
            y = p.y;
          p.x = Math.max(LEFT + 2, Math.min(RIGHT - 2, p.x));
          p.y = Math.max(TOP, Math.min(FLOOR - 2, p.y));
          if (y !== p.y) {
            p.px += (p.x - p.px) * 0.15;
            b.pressure += (Math.abs(y - p.y) * 0.05) / N;
            p.contact = 1;
          }
          if (x !== p.x) {
            b.pressure += (Math.abs(x - p.x) * 0.05) / N;
            p.contact = 1;
          }
        }
      }
    }
    // Finish on contacts rather than shape restoration, so visible bodies do
    // not spring back through one another at the end of a frame.
    for (let pass = 0; pass < 8; pass++) {
      const boxes = this.blobs.map(bounds);
      for (let i = 0; i < this.blobs.length; i++)
        for (let j = i + 1; j < this.blobs.length; j++) {
          if (!this.overlapping(boxes[i], boxes[j])) continue;
          this.contacts(this.blobs[i], this.blobs[j], boxes[j]);
          this.contacts(this.blobs[j], this.blobs[i], boxes[i]);
        }
      for (const b of this.blobs)
        for (const p of b.points) {
          p.x = Math.max(LEFT + 2, Math.min(RIGHT - 2, p.x));
          p.y = Math.max(TOP, Math.min(FLOOR - 2, p.y));
        }
    }
    this.blobs = this.blobs.filter((b) => !b.removing || b.radius > 5);
    if (!this.blobs.some((b) => b.id === this.selected))
      this.selected = this.blobs[0]?.id ?? null;
  }
  private overlapping(a: Box, b: Box) {
    return (
      a.x0 < b.x1 + 1 && b.x0 < a.x1 + 1 && a.y0 < b.y1 + 1 && b.y0 < a.y1 + 1
    );
  }
  /** Memory foam. The remembered shape creeps toward the present outline at a
   * rate set by softness, and recovers toward the true rest shape: slowly
   * while loaded, quickly once free. Small firm bodies barely creep. */
  private remember(b: Blob) {
    const retention = shapeRetention(b.radius);
    // Under load, a firmer body keeps insisting on its shape; a soft one
    // accepts what it is being pressed into. Free bodies never creep and
    // all round out again.
    const loaded = Math.min(1, b.pressure * 5);
    const creep = TUNE.creep * (1 - retention) * loaded;
    const recoverLoaded = TUNE.recoverLoaded * Math.sqrt(retention);
    const recover =
      recoverLoaded + (TUNE.recoverFree - recoverLoaded) * (1 - loaded);
    if (creep < 0.0005 && recover < 0.0005) return;
    const c = center(b),
      angle = orientation(b, c),
      cs = Math.cos(angle),
      sn = Math.sin(angle);
    for (let i = 0; i < b.points.length; i++) {
      const p = b.points[i],
        m = b.memory[i],
        r = b.rest[i];
      // Present shape in the body's own frame.
      const dx = (p.x - c.x) / b.radius,
        dy = (p.y - c.y) / b.radius;
      const lx = dx * cs + dy * sn,
        ly = -dx * sn + dy * cs;
      m.x += (lx - m.x) * creep + (r.x - m.x) * recover;
      m.y += (ly - m.y) * creep + (r.y - m.y) * recover;
    }
    // Memory holds shape, not size: keep its area equal to the rest area.
    const scale = Math.sqrt(polygonArea(b.rest) / (polygonArea(b.memory) || 1));
    for (const m of b.memory) {
      m.x *= scale;
      m.y *= scale;
    }
  }
  /** Hydrostatic drape: a soft body's weight presses hardest at its base, so
   * the deepest boundary points push outward. Bulk conservation then pulls
   * the top down: the body slumps into whatever room lies below it. */
  private drape(b: Blob) {
    const retention = shapeRetention(b.radius);
    // Weight, so it scales with gravity and vanishes without it.
    const push = TUNE.flow * (1 - retention) * (this.gravity / 1400);
    if (push < 0.01) return;
    const n = b.points.length;
    let top = Infinity,
      bottom = -Infinity;
    for (const p of b.points) {
      if (p.y < top) top = p.y;
      if (p.y > bottom) bottom = p.y;
    }
    const height = bottom - top || 1;
    const c = center(b);
    const shifts: { x: number; y: number }[] = [];
    let meanX = 0,
      meanY = 0;
    for (let i = 0; i < n; i++) {
      const p = b.points[i],
        prev = b.points[(i + n - 1) % n],
        next = b.points[(i + 1) % n];
      // Outward normal from the local edge direction.
      let nx = next.y - prev.y,
        ny = prev.x - next.x;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      if (nx * (p.x - c.x) + ny * (p.y - c.y) < 0) {
        nx = -nx;
        ny = -ny;
      }
      const depth = (p.y - top) / height;
      shifts.push({ x: nx * push * depth, y: ny * push * depth });
      meanX += shifts[i].x / n;
      meanY += shifts[i].y / n;
    }
    // Pure deformation: the drape must not also move the body. Gravity does
    // that, and only when it is on.
    for (let i = 0; i < n; i++) {
      b.points[i].x += shifts[i].x - meanX;
      b.points[i].y += shifts[i].y - meanY;
    }
  }
  /** One constraint pass over a single body's own material. */
  private material(b: Blob) {
    const n = b.points.length,
      c = center(b);
    const retention = shapeRetention(b.radius);
    // Shape memory: rotate the remembered shape to the current orientation and
    // pull toward it. Firm on the timescale of a poke; the memory itself is
    // what gives way over time.
    const angle = orientation(b, c),
      cs = Math.cos(angle),
      sn = Math.sin(angle);
    const k = 0.215;
    b.points.forEach((p, i) => {
      const r = b.memory[i];
      p.x += (c.x + (r.x * cs - r.y * sn) * b.radius - p.x) * k;
      p.y += (c.y + (r.x * sn + r.y * cs) * b.radius - p.y) * k;
    });
    // Skin smoothness: a gentle ease toward the neighbours' midpoint, offset
    // by the rest shape's own local curvature, keeps the outline free of
    // polygon noise and spreads vertices evenly without flattening the
    // creature's built-in asymmetry.
    const smooth =
      TUNE.smooth0 + (TUNE.smooth1 - TUNE.smooth0) * (1 - retention);
    const mid = b.points.map((_, i) => {
      const p = b.points[(i + n - 1) % n],
        q = b.points[(i + 1) % n],
        r = b.rest[i],
        rp = b.rest[(i + n - 1) % n],
        rq = b.rest[(i + 1) % n];
      const ox = (r.x - (rp.x + rq.x) / 2) * b.radius,
        oy = (r.y - (rp.y + rq.y) / 2) * b.radius;
      return {
        x: (p.x + q.x) / 2 + ox * cs - oy * sn,
        y: (p.y + q.y) / 2 + ox * sn + oy * cs,
      };
    });
    b.points.forEach((p, i) => {
      const s = smooth * (1 - Math.min(1, p.contact));
      p.x += (mid[i].x - p.x) * s;
      p.y += (mid[i].y - p.y) * s;
    });
    // Skin length: individual edges may not collapse or run away, and the
    // whole outline has a hard budget. Bulk stays put, so the budget decides
    // how far a body can drape, flatten, or wrap around a neighbour.
    const stretch = perimeterStretch(retention);
    let length = 0,
      restLength = 0;
    for (let i = 0; i < n; i++) {
      const p = b.points[i],
        q = b.points[(i + 1) % n],
        r = b.rest[i],
        s = b.rest[(i + 1) % n];
      const dx = q.x - p.x,
        dy = q.y - p.y,
        d = Math.hypot(dx, dy) || 1,
        edge = Math.hypot(s.x - r.x, s.y - r.y) * b.radius,
        target = Math.max(edge * 0.6, Math.min(edge * (1 + stretch * 2.5), d)),
        correction = ((d - target) / d) * 0.32;
      p.x += dx * correction;
      p.y += dy * correction;
      q.x -= dx * correction;
      q.y -= dy * correction;
      length += d;
      restLength += edge;
    }
    const budget = restLength * (1 + stretch);
    if (length > budget) {
      const shrink = ((length - budget) / length) * 0.5;
      for (let i = 0; i < n; i++) {
        const p = b.points[i],
          q = b.points[(i + 1) % n];
        const dx = (q.x - p.x) * shrink,
          dy = (q.y - p.y) * shrink;
        p.x += dx / 2;
        p.y += dy / 2;
        q.x -= dx / 2;
        q.y -= dy / 2;
      }
    }
    // Proportion: dents and wraps are local, but a creature never becomes a
    // tall column or a flat slab. Measure the outline's principal axes and
    // squeeze the long one while stretching the short one when the ratio
    // passes the limit. This preserves area and leaves local features alone.
    let sxx = 0,
      syy = 0,
      sxy = 0;
    for (const p of b.points) {
      const dx = p.x - c.x,
        dy = p.y - c.y;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
    const half = (sxx + syy) / 2,
      spread = Math.hypot((sxx - syy) / 2, sxy);
    const aspect = Math.sqrt((half + spread) / Math.max(1e-6, half - spread));
    const limit = TUNE.aspect0 + (TUNE.aspect1 - TUNE.aspect0) * (1 - retention);
    if (aspect > limit) {
      const theta = Math.atan2(sxy, (sxx - syy) / 2) / 2,
        ax = Math.cos(theta),
        ay = Math.sin(theta);
      // Move a fraction of the way to the limit, keeping area.
      const f = Math.sqrt(limit / aspect),
        g = 1 + (f - 1) * TUNE.aspectRate,
        along = g,
        across = 1 / g;
      for (const p of b.points) {
        const dx = p.x - c.x,
          dy = p.y - c.y;
        const u = dx * ax + dy * ay,
          v = -dx * ay + dy * ax;
        const u2 = u * along,
          v2 = v * across;
        p.x = c.x + u2 * ax - v2 * ay;
        p.y = c.y + u2 * ay + v2 * ax;
      }
    }
    // Internal braces: a firm body resists being squashed in any direction.
    // Soft bodies keep only a trace, enough to avoid folding in half.
    const brace = 0.14 * retention * retention;
    for (const offset of [Math.round(n / 8), n / 4, n / 2]) {
      for (let i = 0; i < (offset === n / 2 ? n / 2 : n); i++) {
        const j = (i + offset) % n;
        const p = b.points[i],
          q = b.points[j];
        const dx = q.x - p.x,
          dy = q.y - p.y;
        const distance = Math.hypot(dx, dy) || 1;
        const rest =
          Math.hypot(b.rest[j].x - b.rest[i].x, b.rest[j].y - b.rest[i].y) *
          b.radius;
        const correction = ((distance - rest) / distance) * brace;
        p.x += dx * correction;
        p.y += dy * correction;
        q.x -= dx * correction;
        q.y -= dy * correction;
      }
    }
    // Bulk: the enclosed area is what a creature really is. Restore it firmly.
    const restArea = polygonArea(b.rest) * b.radius * b.radius;
    const gradients = b.points.map((_, i) => ({
      x: (b.points[(i + 1) % n].y - b.points[(i + n - 1) % n].y) / 2,
      y: (b.points[(i + n - 1) % n].x - b.points[(i + 1) % n].x) / 2,
    }));
    const denom = gradients.reduce((s, p) => s + p.x * p.x + p.y * p.y, 0) || 1,
      lambda = Math.max(-2, Math.min(2, (restArea - area(b)) / denom)) * 0.55;
    b.points.forEach((p, i) => {
      p.x += gradients[i].x * lambda;
      p.y += gradients[i].y * lambda;
    });
    if (this.drag?.id === b.id) {
      const dx = Math.max(-3, Math.min(3, (this.drag.x - c.x) * 0.06)),
        dy = Math.max(-3, Math.min(3, (this.drag.y - c.y) * 0.06));
      b.points.forEach((p) => {
        p.x += dx;
        p.y += dy;
      });
    }
  }
  private contacts(a: Blob, b: Blob, box: Box) {
    // A contact is resolved four ways. Each body can move as a whole, with
    // a share set by its mass, so a large body shoves a small one aside rather
    // than being held up by it. Each body can also dent locally, with a share
    // set by its softness, so a firm little cushion is never dented and a big
    // soft body yields around whatever it meets.
    const bodyA = 1 / mass(a),
      bodyB = 1 / mass(b),
      dentA = TUNE.dent * (1 - shapeRetention(a.radius)) ** 2,
      dentB = TUNE.dent * (1 - shapeRetention(b.radius)) ** 2;
    const total = bodyA + bodyB + dentA + dentB;
    const shareBodyA = bodyA / total,
      shareBodyB = bodyB / total,
      shareDentA = dentA / total,
      shareDentB = dentB / total;
    for (const p of a.points) {
      if (p.x < box.x0 || p.x > box.x1 || p.y < box.y0 || p.y > box.y1)
        continue;
      if (!inside(p.x, p.y, b.points)) continue;
      let best = Infinity,
        edge = 0,
        tBest = 0,
        qx = 0,
        qy = 0;
      for (let i = 0; i < b.points.length; i++) {
        const u = b.points[i],
          v = b.points[(i + 1) % b.points.length],
          dx = v.x - u.x,
          dy = v.y - u.y,
          t = Math.max(
            0,
            Math.min(
              1,
              ((p.x - u.x) * dx + (p.y - u.y) * dy) / (dx * dx + dy * dy || 1),
            ),
          ),
          x = u.x + t * dx,
          y = u.y + t * dy,
          d = (x - p.x) ** 2 + (y - p.y) ** 2;
        if (d < best) {
          best = d;
          edge = i;
          tBest = t;
          qx = x;
          qy = y;
        }
      }
      const distance = Math.sqrt(best);
      if (distance < 0.0001) continue;
      const nx = (qx - p.x) / distance,
        ny = (qy - p.y) / distance,
        u = b.points[edge],
        v = b.points[(edge + 1) % b.points.length];
      const depth = distance + 0.4;
      const moveA = depth * shareBodyA,
        moveB = depth * shareBodyB;
      for (const vertex of a.points) {
        vertex.x += nx * moveA;
        vertex.y += ny * moveA;
      }
      for (const vertex of b.points) {
        vertex.x -= nx * moveB;
        vertex.y -= ny * moveB;
      }
      p.x += nx * depth * shareDentA;
      p.y += ny * depth * shareDentA;
      // Spread the local dent over the edge's two vertices. With weights that
      // sum to more than one at mid-edge, the edge itself moves by the share.
      const wu = (1 - tBest) / ((1 - tBest) ** 2 + tBest * tBest),
        wv = tBest / ((1 - tBest) ** 2 + tBest * tBest);
      u.x -= nx * depth * shareDentB * wu;
      u.y -= ny * depth * shareDentB * wu;
      v.x -= nx * depth * shareDentB * wv;
      v.y -= ny * depth * shareDentB * wv;
      p.contact = 1;
      u.contact = Math.max(u.contact, 1 - tBest);
      v.contact = Math.max(v.contact, tBest);
      a.pressure += (distance * 0.02) / N;
      b.pressure += (distance * 0.02) / N;
    }
  }
}
