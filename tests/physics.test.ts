import test from "node:test";
import assert from "node:assert/strict";
import { trappedGapFraction } from "./packing-metrics.ts";
import {
  World,
  area,
  center,
  inside,
  LEFT,
  RIGHT,
  FLOOR,
  TOP,
  MAX_BLOBS,
} from "../src/physics.ts";

const advance = (w: World, n = 360) => {
  for (let i = 0; i < n; i++) w.step(1 / 60);
};
// The north star itself measures 3.4, 1.8 and 1.5 percent under this metric.
test("presets leave about as little trapped white space as the north star", () => {
  for (const [stage, limit] of [
    [0, 0.045],
    [1, 0.03],
    [2, 0.03],
  ]) {
    const w = new World();
    w.preset(stage);
    advance(w, 900);
    assert.ok(
      trappedGapFraction(w) < limit,
      `stage ${stage}: ${trappedGapFraction(w)}`,
    );
    validate(w);
  }
});
test("a rearranged pile settles without large trapped pockets", () => {
  const w = new World();
  w.preset(2);
  advance(w, 900);
  for (const id of [1, 3, 2]) {
    w.drag = { id, x: LEFT + (id === 1 ? 144 : 324), y: FLOOR - 468 };
    advance(w, 90);
    w.drag = null;
    advance(w, 900);
    assert.ok(
      trappedGapFraction(w) < 0.05,
      `after moving ${id}: ${trappedGapFraction(w)}`,
    );
    validate(w);
  }
});
test("a large body dropped onto small ones sinks between them instead of arching", () => {
  const w = new World();
  w.preset(1);
  advance(w, 300);
  // Released just above the pile. From the top of the phone-shaped jar the
  // big body lands hard enough to arch over the small ones (about 7 percent
  // trapped); that high drop is a known leftover, not a target.
  w.drag = { id: 1, x: LEFT + 134, y: FLOOR - 400 };
  advance(w, 240);
  w.drag = null;
  advance(w, 900);
  assert.ok(trappedGapFraction(w) < 0.045, `arch: ${trappedGapFraction(w)}`);
  validate(w);
});
test("large bodies form contact indentations while the smallest remains rounded", () => {
  const w = new World();
  w.preset(2);
  advance(w, 900);
  const indentation = (b: (typeof w.blobs)[number]) => {
    let inwardTurns = 0;
    for (let i = 0; i < b.points.length; i++) {
      const prev = b.points[(i + b.points.length - 1) % b.points.length];
      const p = b.points[i],
        next = b.points[(i + 1) % b.points.length];
      const turn =
        (p.x - prev.x) * (next.y - p.y) - (p.y - prev.y) * (next.x - p.x);
      inwardTurns += Math.max(0, -turn);
    }
    return inwardTurns / (b.radius * b.radius);
  };
  const large = w.blobs.find((b) => b.id === 1)!;
  const small = w.blobs.find((b) => b.id === 5)!;
  assert.ok(
    indentation(large) > 0.05,
    "large body develops a concave contact, not just an oval",
  );
  assert.ok(
    indentation(small) < 0.01,
    "small body keeps its convex silhouette",
  );
  validate(w);
});
test("a pinched creature recovers its original shape when pressure is released", () => {
  const w = new World();
  w.gravity = 0;
  const b = w.add("Pinched orange", 300, 300, 56)!;
  const original = b.rest.map((p) => ({ ...p }));
  b.points.forEach((p, i) => {
    // Deep asymmetric indentation, plus a tall stretched outline.
    const scale = i >= 3 && i <= 9 ? 0.25 : 1;
    p.x = p.px = 300 + b.rest[i].x * b.radius * scale;
    p.y = p.py = 300 + b.rest[i].y * b.radius * 1.4;
  });
  advance(w, 120);
  let error = 0;
  for (let i = 0; i < b.points.length; i++)
    for (let j = i + 1; j < b.points.length; j++) {
      const actual = Math.hypot(
        b.points[i].x - b.points[j].x,
        b.points[i].y - b.points[j].y,
      );
      const expected =
        Math.hypot(b.rest[i].x - b.rest[j].x, b.rest[i].y - b.rest[j].y) *
        b.radius;
      error = Math.max(error, Math.abs(actual - expected) / b.radius);
    }
  assert.ok(error < 0.03, `rest-shape recovery error ${error}`);
  assert.deepEqual(b.rest, original, "deformation never replaces shape memory");
  validate(w);
});
test("initially overlapping creatures separate and can be pulled apart", () => {
  const w = new World();
  w.gravity = 0;
  const a = w.add("Orange", 280, 300, 65)!,
    b = w.add("Purple", 290, 310, 48)!;
  advance(w, 180);
  validate(w);
  let ca = center(a),
    cb = center(b);
  assert.ok(
    Math.hypot(ca.x - cb.x, ca.y - cb.y) > 90,
    "overlap resolves into separate bodies",
  );
  w.drag = { id: a.id, x: 120, y: 200 };
  advance(w, 120);
  w.drag = null;
  advance(w, 120);
  ca = center(a);
  cb = center(b);
  assert.ok(
    Math.hypot(ca.x - cb.x, ca.y - cb.y) > 140,
    "contact does not fuse the pair",
  );
  validate(w);
});
test("small creature survives dragging through a grown pile and recovers after release", () => {
  const w = new World();
  w.preset(1);
  for (let i = 0; i < 8; i++) {
    w.grow(1);
    w.grow(2);
  }
  advance(w, 360);
  for (const [x, y] of [
    [344, 48],
    [84, 48],
    [224, 148],
    [364, 48],
  ]) {
    w.drag = { id: 4, x: LEFT + x, y: FLOOR - y };
    advance(w, 60);
  }
  w.drag = null;
  advance(w, 360);
  validate(w);
  const orange = w.blobs.find((b) => b.id === 4)!;
  w.blobs = [orange];
  w.gravity = 0;
  // Lift clear of the walls to measure recovery without continuing contact.
  const c = center(orange);
  orange.points.forEach((p) => {
    p.x += 300 - c.x;
    p.y += 300 - c.y;
    p.px = p.x;
    p.py = p.y;
  });
  advance(w, 120);
  const settled = center(orange);
  const radii = orange.points.map((p) =>
    Math.hypot(p.x - settled.x, p.y - settled.y),
  );
  assert.ok(
    Math.min(...radii) > orange.radius * 0.88,
    "no persistent neck or folded lobe",
  );
  assert.ok(
    Math.max(...radii) < orange.radius * 1.12,
    "returns to a plump body",
  );
});
function validate(w: World) {
  for (const b of w.blobs) {
    assert.ok(area(b) > 0, `blob ${b.id} remains oriented`);
    const ratio = area(b) / (Math.PI * b.radius * b.radius);
    assert.ok(
      ratio > 0.72 && ratio < 1.2,
      `blob ${b.id} preserves bulk: ${ratio}`,
    );
    for (const p of b.points) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
      assert.ok(p.x >= LEFT && p.x <= RIGHT && p.y >= TOP && p.y <= FLOOR);
    }
  }
}
for (const preset of [0, 1, 2])
  test(`preset ${preset} settles with finite, bounded, substantial bodies`, () => {
    const w = new World();
    w.preset(preset);
    advance(w, 600);
    validate(w);
    const before = w.blobs.map(center);
    advance(w, 60);
    const drift = Math.max(
      ...w.blobs.map((b, i) =>
        Math.hypot(center(b).x - before[i].x, center(b).y - before[i].y),
      ),
    );
    assert.ok(drift < 8, `settled drift ${drift}`);
  });
test("completing a support releases a neighbor to fall", () => {
  const w = new World();
  w.preset();
  advance(w);
  const peach = w.blobs.find((b) => b.id === 4)!;
  const before = center(peach).y;
  w.complete(1);
  advance(w);
  assert.ok(!w.blobs.some((b) => b.id === 1));
  assert.ok(center(peach).y > before + 50);
  validate(w);
});
test("repeated growth respects the finite capacity", () => {
  const w = new World();
  w.preset();
  for (let i = 0; i < 100; i++) w.grow(1);
  assert.ok(w.blobs[0].target <= 200);
  advance(w);
  validate(w);
});
test("fast out-of-bounds dragging cannot escape the jar", () => {
  const w = new World();
  w.preset();
  for (const [x, y] of [
    [-500, -500],
    [1200, 900],
    [300, 60],
  ]) {
    w.drag = { id: 1, x, y };
    advance(w, 45);
  }
  w.drag = null;
  advance(w, 600);
  validate(w);
});
test("spawn cap and repeated removals do not leave invalid selection", () => {
  const w = new World();
  for (let i = 0; i < MAX_BLOBS; i++)
    w.add("test", 60 + (i % 10) * 36, 150 + Math.floor(i / 10) * 60, 16);
  assert.equal(w.add("one too many"), null);
  w.selected = w.blobs[0].id;
  w.complete(w.selected);
  advance(w);
  assert.equal(w.blobs.length, MAX_BLOBS - 1);
  assert.ok(w.blobs.some((b) => b.id === w.selected));
  validate(w);
});
test("settled contacts do not leave deeply penetrating vertices", () => {
  const w = new World();
  w.preset(2);
  advance(w, 600);
  let maxDepth = 0;
  for (const a of w.blobs)
    for (const b of w.blobs) {
      if (a === b) continue;
      for (const p of a.points) {
        if (!inside(p.x, p.y, b.points)) continue;
        let depth = Infinity;
        for (let i = 0; i < b.points.length; i++) {
          const u = b.points[i],
            v = b.points[(i + 1) % b.points.length],
            dx = v.x - u.x,
            dy = v.y - u.y,
            t = Math.max(
              0,
              Math.min(
                1,
                ((p.x - u.x) * dx + (p.y - u.y) * dy) / (dx * dx + dy * dy),
              ),
            );
          depth = Math.min(
            depth,
            Math.hypot(p.x - u.x - t * dx, p.y - u.y - t * dy),
          );
        }
        maxDepth = Math.max(maxDepth, depth);
      }
    }
  assert.ok(maxDepth < 3, `max contact penetration ${maxDepth}`);
});
