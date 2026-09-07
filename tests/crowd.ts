// Crowd harness for the app: ten creatures, several at max size, scaled to a
// fill fraction the way fitRadii does. With SEQ=1 they are added one at a
// time at full size (how the app loads); otherwise dropped small and
// inflated in a heap (how it used to load). Prints the worst lobe reach (a
// vertex's distance from centre over the radius; 1.5 is a lobe) and the
// residual drift after settling, against the playground's squish preset, and
// writes an SVG.
//
//   SEQ=1 node --experimental-strip-types tests/crowd.ts 0.8
//   SEQ=1 TUNE='{"dent":10}' TAG=-dent10 node --experimental-strip-types tests/crowd.ts 0.8
import { writeFileSync } from "node:fs";
import {
  TUNE,
  World,
  WIDTH,
  HEIGHT,
  LEFT,
  RIGHT,
  TOP,
  FLOOR,
  center,
  JAR_AREA,
  PALETTE,
} from "../src/physics.ts";
import { renderedPolygon } from "./sheet.ts";
import type { Blob } from "../src/physics.ts";

const cap = Number(process.argv[2] ?? 0.8);
Object.assign(TUNE, JSON.parse(process.env.TUNE ?? "{}"));
const tag = process.env.TAG ?? "";
const seq = process.env.SEQ === "1";

let radii = [118, 118, 118, 110, 100, 82, 82, 60, 40, 32];
const total = radii.reduce((s, r) => s + Math.PI * r * r, 0);
const scale = Math.sqrt((JAR_AREA * cap) / total);
radii = radii.map((r) => r * scale);

const w = new World();
radii.forEach((r, i) => {
  const x = LEFT + r + 10 + ((i * 0.618) % 1) * (RIGHT - LEFT - 2 * r - 20);
  const b = w.add(`b${i}`, x, TOP + r + 6, seq ? r : r * 0.55, PALETTE[i % 6])!;
  b.target = r;
  for (let k = 0; k < (seq ? 70 : 40); k++) w.step(1 / 60);
});
for (let k = 0; k < 2400; k++) w.step(1 / 60);

let worst = 0;
for (const b of w.blobs) {
  const c = center(b);
  const far =
    Math.max(...b.points.map((p) => Math.hypot(p.x - c.x, p.y - c.y))) /
    b.radius;
  worst = Math.max(worst, far);
}
const settle = (world: World) => {
  const before = world.blobs.map(center);
  for (let k = 0; k < 300; k++) world.step(1 / 60);
  return Math.max(
    ...world.blobs.map((b, i) =>
      Math.hypot(center(b).x - before[i].x, center(b).y - before[i].y),
    ),
  );
};
const drift = settle(w);
const pw = new World();
pw.preset(2);
for (let k = 0; k < 2400; k++) pw.step(1 / 60);
const pdrift = settle(pw);
console.log(
  `cap ${cap} · scale ${scale.toFixed(2)} · worst reach ${worst.toFixed(2)} · drift over 5s: app ${drift.toFixed(1)}px, playground squish ${pdrift.toFixed(1)}px`,
);

const path = (b: Blob) =>
  renderedPolygon(b)
    .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join("") + "Z";
writeFileSync(
  `test-results/crowd-${cap}${tag}.svg`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}"><rect width="100%" height="100%" fill="#fbf8f2"/><path d="M${LEFT},${TOP}V${FLOOR}H${RIGHT}V${TOP}" fill="none" stroke="#48413e" stroke-width="2"/>${w.blobs.map((b) => `<path d="${path(b)}" fill="${b.color}" stroke="#48413e" stroke-width="1.7"/>`).join("")}</svg>`,
);
