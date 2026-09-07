import { World, inside, LEFT, RIGHT, FLOOR, TOP } from "../src/physics.ts";

// White samples beneath the upper silhouette, excluding free space above the pile.
export function trappedGapFraction(world: World) {
  let empty = 0,
    envelope = 0;
  for (let x = LEFT + 4; x < RIGHT - 4; x += 4) {
    let entered = false;
    for (let y = TOP; y < FLOOR - 3; y += 4) {
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
if (process.argv[1]?.endsWith("packing-metrics.ts")) {
  for (const preset of [0, 1, 2]) {
    const w = new World();
    w.preset(preset);
    for (let i = 0; i < 900; i++) w.step(1 / 60);
    console.log({ preset, trappedGapFraction: trappedGapFraction(w) });
  }
}
