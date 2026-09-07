// Measure the north-star image under the same column-based trapped-gap metric.
// Classify each pixel as paper (empty) or not, per jar panel; from the first
// non-paper pixel in each column down to the floor, count paper pixels.
import { readFileSync, writeFileSync } from "node:fs";

const buf = readFileSync(process.argv[2]);
// P6\n1536 1024\n255\n
let pos = 0,
  fields: string[] = [];
while (fields.length < 4) {
  let tok = "";
  while (buf[pos] === 0x20 || buf[pos] === 0x0a) pos++;
  while (buf[pos] !== 0x20 && buf[pos] !== 0x0a) tok += String.fromCharCode(buf[pos++]);
  fields.push(tok);
}
pos++;
const W = +fields[1],
  H = +fields[2];
const px = (x: number, y: number) => {
  const i = pos + (y * W + x) * 3;
  return [buf[i], buf[i + 1], buf[i + 2]];
};

// Panels: inner jar rectangles (x0, x1, yTop, yFloor). The floor line sits at
// y≈828, the walls at x≈40/500, 552/1010, 1030/1500.
const panels = [
  { name: "01 settled", x0: 46, x1: 494, y0: 208, y1: 824 },
  { name: "02 crowded", x0: 558, x1: 1004, y0: 208, y1: 824 },
  { name: "03 squish", x0: 1036, x1: 1494, y0: 208, y1: 824 },
];
const paper = [247, 240, 228];
const dist = (a: number[], b: number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Debug map: paper = white, gap-shade = red, blob = gray
const out = Buffer.alloc(W * H * 3, 255);
const arg = process.argv[3] ? +process.argv[3] : 18;
for (const p of panels) {
  let empty = 0,
    envelope = 0,
    emptyAll = 0,
    all = 0;
  for (let x = p.x0; x <= p.x1; x++) {
    let entered = false;
    for (let y = p.y0; y <= p.y1; y++) {
      const c = px(x, y);
      const isPaper = dist(c, paper) < arg;
      all++;
      if (isPaper) emptyAll++;
      if (!isPaper) entered = true;
      const o = (y * W + x) * 3;
      if (isPaper) {
        out[o] = 255;
        out[o + 1] = 255;
        out[o + 2] = 255;
      } else {
        out[o] = 120;
        out[o + 1] = 120;
        out[o + 2] = 120;
      }
      if (entered) {
        envelope++;
        if (isPaper) {
          empty++;
          out[o] = 220;
          out[o + 1] = 40;
          out[o + 2] = 40;
        }
      }
    }
  }
  console.log(
    `${p.name}: trapped ${((100 * empty) / envelope).toFixed(2)}%  (jar fill ${((100 * (all - emptyAll)) / all).toFixed(1)}%)`,
  );
}
writeFileSync(
  process.argv[4] ?? "ns-map.ppm",
  Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), out]),
);
