// Segment the north-star blobs per panel: connected components of non-paper,
// non-outline pixels, labelled by nearest fill colour. Prints area, equivalent
// radius (scaled to a target jar width), centroid and bounding box.
import { readFileSync } from "node:fs";
const buf = readFileSync(process.argv[2]);
let pos = 0,
  fields: string[] = [];
while (fields.length < 4) {
  let tok = "";
  while (buf[pos] === 0x20 || buf[pos] === 0x0a) pos++;
  while (buf[pos] !== 0x20 && buf[pos] !== 0x0a) tok += String.fromCharCode(buf[pos++]);
  fields.push(tok);
}
pos++;
const W = +fields[1];
const px = (x: number, y: number) => {
  const i = pos + (y * W + x) * 3;
  return [buf[i], buf[i + 1], buf[i + 2]];
};
const panels = [
  { name: "01 settled", x0: 46, x1: 494, y0: 208, y1: 824 },
  { name: "02 crowded", x0: 558, x1: 1004, y0: 208, y1: 824 },
  { name: "03 squish", x0: 1036, x1: 1494, y0: 208, y1: 824 },
];
const fills: [string, number[]][] = [
  ["pink", [214, 185, 190]],
  ["pinksm", [224, 187, 193]],
  ["sage", [196, 191, 172]],
  ["peri", [191, 184, 202]],
  ["peach", [234, 186, 160]],
  ["cream", [237, 222, 203]],
];
const paper = [247, 240, 228];
const dist = (a: number[], b: number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const targetJarWidth = +(process.argv[3] ?? 398);
for (const p of panels) {
  const w = p.x1 - p.x0 + 1,
    h = p.y1 - p.y0 + 1;
  const label = new Int8Array(w * h).fill(-1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = px(p.x0 + x, p.y0 + y);
      if (dist(c, paper) < 18) continue;
      if (c[0] + c[1] + c[2] < 3 * 140) continue; // outline / eyes
      let best = Infinity,
        li = -1;
      fills.forEach(([, f], i) => {
        const d = dist(c, f);
        if (d < best) {
          best = d;
          li = i;
        }
      });
      if (best < 40) label[y * w + x] = li;
    }
  const seen = new Uint8Array(w * h);
  const comps: { label: string; area: number; cx: number; cy: number; bx0: number; by0: number; bx1: number; by1: number }[] = [];
  for (let s = 0; s < w * h; s++) {
    if (label[s] < 0 || seen[s]) continue;
    const li = label[s];
    const stack = [s];
    seen[s] = 1;
    let area = 0,
      sx = 0,
      sy = 0,
      bx0 = w,
      by0 = h,
      bx1 = 0,
      by1 = 0;
    while (stack.length) {
      const k = stack.pop()!;
      const x = k % w,
        y = Math.floor(k / w);
      area++;
      sx += x;
      sy += y;
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (y < by0) by0 = y;
      if (y > by1) by1 = y;
      for (const nb of [k - 1, k + 1, k - w, k + w]) {
        if (nb < 0 || nb >= w * h || seen[nb]) continue;
        if (Math.abs((nb % w) - x) > 1) continue;
        // Merge pink and pinksm across the label (they are close colours).
        if (label[nb] !== li && !(fills[label[nb]]?.[0].startsWith("pink") && fills[li][0].startsWith("pink"))) continue;
        seen[nb] = 1;
        stack.push(nb);
      }
    }
    if (area > 800)
      comps.push({ label: fills[li][0], area, cx: sx / area, cy: sy / area, bx0, by0, bx1, by1 });
  }
  comps.sort((a, b) => b.area - a.area);
  const scale = targetJarWidth / w;
  console.log(`${p.name} (jar ${w}x${h}, scale ${scale.toFixed(3)})`);
  for (const c of comps)
    console.log(
      `  ${c.label.padEnd(7)} area ${c.area.toString().padStart(6)}  r_eq ${(Math.sqrt(c.area / Math.PI) * scale).toFixed(0).padStart(4)}  bbox ${((c.bx1 - c.bx0) * scale).toFixed(0)}x${((c.by1 - c.by0) * scale).toFixed(0)}  centre (${(c.cx * scale).toFixed(0)}, ${(c.cy * scale).toFixed(0)}) from top`,
    );
  const total = comps.reduce((s, c) => s + c.area, 0);
  console.log(`  segmented fill ${((100 * total) / (w * h)).toFixed(1)}% (outlines excluded)`);
}
