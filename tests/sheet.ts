// Headless experiment harness: run scenarios on the physics World, emit an SVG
// contact sheet (same midpoint-quadratic smoothing as the Pixi renderer), and
// print the trapped-gap metric per scenario.
import { writeFileSync } from "node:fs";
import {
  World,
  WIDTH,
  HEIGHT,
  LEFT,
  RIGHT,
  TOP,
  FLOOR,
  center,
  inside,
} from "../src/physics.ts";
import type { Blob } from "../src/physics.ts";

export function trappedGapFraction(world: World, spacing = 4) {
  let empty = 0,
    envelope = 0;
  for (let x = LEFT + 4; x < RIGHT - 4; x += spacing) {
    let entered = false;
    for (let y = TOP; y < FLOOR - 3; y += spacing) {
      const occupied = world.blobs.some((b) => inside(x, y, b.points));
      if (occupied) entered = true;
      if (entered) {
        envelope++;
        if (!occupied) empty++;
      }
    }
  }
  return envelope ? empty / envelope : 0;
}

// Sample the *rendered* outline (midpoint quadratic curves) rather than the
// raw polygon, so renderer gaps at convex corners are counted too.
export function renderedPolygon(b: Blob, subdivisions = 6) {
  const p = b.points,
    n = p.length,
    out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = {
      x: (p[(i + n - 1) % n].x + p[i].x) / 2,
      y: (p[(i + n - 1) % n].y + p[i].y) / 2,
    };
    const c = p[i];
    const d = { x: (p[i].x + p[(i + 1) % n].x) / 2, y: (p[i].y + p[(i + 1) % n].y) / 2 };
    for (let k = 0; k < subdivisions; k++) {
      const t = k / subdivisions,
        u = 1 - t;
      out.push({
        x: u * u * a.x + 2 * u * t * c.x + t * t * d.x,
        y: u * u * a.y + 2 * u * t * c.y + t * t * d.y,
      });
    }
  }
  return out;
}
export function renderedGapFraction(world: World, spacing = 3) {
  const polys = world.blobs.map((b) => renderedPolygon(b));
  let empty = 0,
    envelope = 0;
  for (let x = LEFT + 3; x < RIGHT - 3; x += spacing) {
    let entered = false;
    for (let y = TOP; y < FLOOR - 2; y += spacing) {
      const occupied = polys.some((p) => inside(x, y, p));
      if (occupied) entered = true;
      if (entered) {
        envelope++;
        if (!occupied) empty++;
      }
    }
  }
  return envelope ? empty / envelope : 0;
}

function path(b: Blob) {
  const p = b.points,
    n = p.length;
  let d = `M${((p[n - 1].x + p[0].x) / 2).toFixed(1)},${((p[n - 1].y + p[0].y) / 2).toFixed(1)}`;
  for (let i = 0; i < n; i++)
    d += ` Q${p[i].x.toFixed(1)},${p[i].y.toFixed(1)} ${((p[i].x + p[(i + 1) % n].x) / 2).toFixed(1)},${((p[i].y + p[(i + 1) % n].y) / 2).toFixed(1)}`;
  return d + "Z";
}

export function svgPanel(world: World, label: string, showPolygon = false) {
  let s = `<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="#f8f4ec"/>`;
  s += `<path d="M${LEFT + 8},38 Q${LEFT},41 ${LEFT},54 L${LEFT},${FLOOR - 22} Q${LEFT},${FLOOR} ${LEFT + 23},${FLOOR} L${RIGHT - 23},${FLOOR} Q${RIGHT},${FLOOR} ${RIGHT},${FLOOR - 22} L${RIGHT},54 Q${RIGHT},41 ${RIGHT - 8},38" fill="none" stroke="#48413e" stroke-width="2.4"/>`;
  for (const b of world.blobs) {
    s += `<path d="${path(b)}" fill="${b.color}" stroke="#48413e" stroke-width="1.7"/>`;
    if (showPolygon)
      s += `<polygon points="${b.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}" fill="none" stroke="#c03" stroke-width="0.6" opacity="0.6"/>`;
    const c = center(b);
    const size = Math.max(2.5, Math.min(6, 3 * Math.sqrt(b.radius / 45)));
    const spacing = size * 3.8;
    const cy = c.y + Math.min(b.radius * 0.1, 10);
    const guilty = b.radius / b.base > 1.22;
    const squeezed = b.pressure > 0.35 && !guilty;
    for (const side of [-1, 1]) {
      const x = c.x + (side * spacing) / 2;
      if (squeezed)
        s += `<polyline points="${x + side * size * 0.6},${cy - size} ${x - side * size * 0.6},${cy} ${x + side * size * 0.6},${cy + size}" fill="none" stroke="#393536" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
      else
        s += `<ellipse cx="${x}" cy="${cy}" rx="${size * 0.48}" ry="${guilty ? size * 1.6 : size * 0.88}" fill="#393536"/>`;
    }
  }
  s += `<text x="${WIDTH / 2}" y="${HEIGHT - 8}" font-family="serif" font-size="16" text-anchor="middle" fill="#48413e">${label}</text>`;
  return s;
}

export function contactSheet(panels: string[], cols = 3) {
  const rows = Math.ceil(panels.length / cols);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH * cols}" height="${HEIGHT * rows}" viewBox="0 0 ${WIDTH * cols} ${HEIGHT * rows}">`;
  panels.forEach((p, i) => {
    s += `<g transform="translate(${(i % cols) * WIDTH},${Math.floor(i / cols) * HEIGHT})">${p}</g>`;
  });
  return s + "</svg>";
}

// Per-blob: which constraint is binding? Outline length vs budget, aspect.
export function diagnostics(w: World) {
  return w.blobs
    .map((b) => {
      const n = b.points.length;
      let length = 0,
        rest = 0;
      for (let i = 0; i < n; i++) {
        const p = b.points[i],
          q = b.points[(i + 1) % n];
        length += Math.hypot(q.x - p.x, q.y - p.y);
        rest += Math.hypot(b.rest[(i + 1) % n].x - b.rest[i].x, b.rest[(i + 1) % n].y - b.rest[i].y) * b.radius;
      }
      const c = center(b);
      let sxx = 0,
        syy = 0,
        sxy = 0;
      for (const p of b.points) {
        sxx += (p.x - c.x) ** 2;
        syy += (p.y - c.y) ** 2;
        sxy += (p.x - c.x) * (p.y - c.y);
      }
      const half = (sxx + syy) / 2,
        spread = Math.hypot((sxx - syy) / 2, sxy);
      const aspect = Math.sqrt((half + spread) / (half - spread));
      return `#${b.id} r${b.radius.toFixed(0)} skin+${((length / rest - 1) * 100).toFixed(0)}% asp${aspect.toFixed(2)} p${b.pressure.toFixed(2)}`;
    })
    .join(" | ");
}

export const settle = (w: World, n: number) => {
  for (let i = 0; i < n; i++) w.step(1 / 60);
};

export type Scenario = { name: string; run: () => World };

export function scenarios(make: () => World = () => new World()): Scenario[] {
  return [
    ...[0, 1, 2].map((stage) => ({
      name: `preset ${stage}`,
      run: () => {
        const w = make();
        w.preset(stage);
        settle(w, 900);
        return w;
      },
    })),
    {
      name: "P1: drag big to top-left, release",
      run: () => {
        const w = make();
        w.preset(1);
        settle(w, 300);
        w.drag = { id: 1, x: 170, y: 130 };
        settle(w, 240);
        w.drag = null;
        settle(w, 900);
        return w;
      },
    },
    {
      name: "P2: drag big to top-left, release",
      run: () => {
        const w = make();
        w.preset(2);
        settle(w, 300);
        w.drag = { id: 1, x: 200, y: 150 };
        settle(w, 240);
        w.drag = null;
        settle(w, 900);
        return w;
      },
    },
    {
      name: "P0: grow pink x4, then complete sage",
      run: () => {
        const w = make();
        w.preset(0);
        settle(w, 300);
        for (let i = 0; i < 4; i++) {
          w.grow(1);
          settle(w, 200);
        }
        w.complete(2);
        settle(w, 900);
        return w;
      },
    },
    {
      name: "P1: drag small cream to top, release",
      run: () => {
        const w = make();
        w.preset(1);
        settle(w, 300);
        w.drag = { id: 5, x: 300, y: 100 };
        settle(w, 240);
        w.drag = null;
        settle(w, 900);
        return w;
      },
    },
    {
      name: "P0: add three, grow sage x3",
      run: () => {
        const w = make();
        w.preset(0);
        settle(w, 300);
        w.add("a", 200, 100, 40);
        settle(w, 200);
        w.add("b", 380, 100, 52);
        settle(w, 200);
        w.add("c", 300, 100, 46);
        settle(w, 200);
        for (let i = 0; i < 3; i++) {
          w.grow(2);
          settle(w, 200);
        }
        settle(w, 700);
        return w;
      },
    },
  ];
}

if (process.argv[1]?.endsWith("sheet.ts")) {
  const out = process.argv[2] ?? "sheet.svg";
  const showPolygon = process.argv.includes("--poly");
  const tuneArg = process.argv.find((a) => a.startsWith("--tune="));
  if (tuneArg) {
    const mod = await import(
      "../src/physics.ts"
    );
    Object.assign(mod.TUNE, JSON.parse(tuneArg.slice(7)));
    console.log("tune", JSON.stringify(mod.TUNE));
  }
  const panels: string[] = [];
  const t0 = performance.now();
  let steps = 0;
  for (const s of scenarios()) {
    const w = s.run();
    const raw = trappedGapFraction(w),
      rendered = renderedGapFraction(w);
    const label = `${s.name} · gap ${(raw * 100).toFixed(1)}% · rendered ${(rendered * 100).toFixed(1)}%`;
    console.log(label);
    if (process.argv.includes("--diag")) console.log("   " + diagnostics(w));
    panels.push(svgPanel(w, label, showPolygon));
  }
  writeFileSync(out, contactSheet(panels));
  console.log(`wrote ${out} in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
}
