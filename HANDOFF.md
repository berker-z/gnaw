# gnaw — handoff

Updated September 7, 2026, late evening. Read this first in the next session.

## Where things stand

**The product is called gnaw now** (the folder is still `taskblob`; do not rename it). Public repo: github.com/berker-z/gnaw. Commits are the user's own; never add any AI attribution to commits, PRs or code.

**The physics is approved and the app has started.** The user chose material F on the evening of the 7th and then asked for the first app pass: a phone-shaped jar, real task data with deadlines and moods, no dragging in the app (kept on a second tab), a modal per creature with edit / set free / split, and strong visual moments for setting free and splitting. All of that is in and passing tests. The user has been reviewing it live and giving small notes (sheepish face back, no drop on the overdue face, mixed load order, no count limit); expect more of the same on effects, copy and sizes.

Debug buttons in the Jar's bottom bar: `+?` adds a random creature of any mood, `↗?` ages a random handful by a few sizes (shifts `createdAt`), `✕?` clears the jar.

## The app

Two tabs in a phone-shaped shell (`src/main.tsx`): **Jar** is the app, **Playground** is the old demo with dragging, presets and grow. On a handset the shell is the viewport; on a desk it is a 430 by 900 rounded frame. The canvas is 450 by 800 (`WIDTH`, `HEIGHT` in `src/physics.ts`), letterboxed inside whatever room the layout gives it by a `ResizeObserver` in `mountScene`. The jar walls keep the north star's 398px inner width (`LEFT` 26, `RIGHT` 424), so the tuned material and presets behave as before; only the height changed (`FLOOR` 770).

Layers, as the roadmap wanted them:

- `src/tasks.ts`: the domain. A task is `{id, title, color, createdAt, deadline | null}`. Everything visible is a pure function of task and time: `mood`, `naturalRadius`, `fitRadii`, `describe`, `splitTask`, the dd/mm/yyyy and 24h formatters. No physics, no DOM.
- `src/storage.ts`: `TaskStore` interface, `localStore` (localStorage key `gnaw.tasks.v1`, versioned and validated) and a `memoryStore` for tests. The roadmap's IndexedDB idea is deferred; swap the store when the native wrapper needs it.
- `src/physics.ts`: unchanged material. New: `MAX_BLOBS` (64, a sanity guard only; was 12), `remove` (instant, so the pile collapses), `nudge` (velocity), `shrinkTo` (start small and inflate). `World` still knows nothing about dates.
- `src/scene.ts`: drawing, faces, effects, input. `mountScene(host, world, {interactive, moodOf, onSelect, onTap})`. Returns `setFree`, `split`, `dropIn`, `setPaused`, `destroy`.
- `src/Jar.tsx`: the app screen. Owns tasks, the task-id to blob-id map, the sheets, the toast with undo, and a 2-second resize tick that eases every creature toward `fitRadii`.
- `src/Playground.tsx`, `src/Sheet.tsx`, `src/app.css`.

The old four-study prototype (`src/main.js`, `src/style.css`) and `src/playground.css` are deleted.

## Sizes and moods (the rules the user gave)

- A task may have a deadline (date dd/mm/yyyy plus 24h time, both shown that way everywhere; input uses native date and time pickers, time defaults to 09:00 if left blank). Every task has a creation timestamp.
- **Deadlined, not yet due: asleep.** Closed dipping eyes, no blinking, three little z's drifting up every 6.5 seconds (one static z under reduced motion). Size grows linearly with elapsed / (deadline − created) from `SIZE.min` 32 to `SIZE.deadlineMax` 82.
- **Deadlined, past due: uncomfortable.** Stays at 82, wears `><` with blush. No drop: the user removed it, the drop is sheepishness only.
- **No deadline: awake.** Dots that blink. Grows `SIZE.freePerHour` 0.55 px per hour to `SIZE.freeMax` 118 (about 6.5 days), never squints. In the app, pressure squints are off so `><` means only one thing; the playground keeps the physical vocabulary.
- **No deadline, lingering: sheepish.** Once a free creature is `SIZE.sheepishAt` (70 percent) of the way to its max, about four and a half days, it wears the north star's `ı ı` tall pupils with blush and a drop. Deadlined creatures never do; big sleepers are just asleep.
- When the cast would exceed `APP_CAPACITY` (80 percent of the jar) everyone is scaled down by the same factor. There is no count limit by design (the user called one "horrendous UX"): adding one more shrinks everyone a little. Only the physics guard `MAX_BLOBS` (64) remains, and frame rate will suffer long before it.

## Interactions

- **Tap a creature** (no drag in the Jar tab; a press that moves under 12px is a tap) or pick it from the list sheet (the ≡ button, which is the accessible route to buried creatures). The task sheet shows mood, status line, creation moment, and Edit / Split / Set free.
- **Set free**: the creature leaves the physics world at once, so the pile settles into its room, while a ghost of its outline takes a happy breath (closed arched eyes, a smile, a 10 percent puff) and floats up out of the jar's open mouth with a soft ring and cream and colour sparks. About 1.7 seconds. The toast offers Undo for 7 seconds, which drops the task back in from the top.
- **Split**: two step fields by default, "+ one more" up to eight, Continue, then a confirmation listing the steps. On confirm the parent pops (swells and fades in 0.4 seconds with a radial burst) and the steps spawn small around its centre, nudged outward, then inflate. Steps keep the parent's colour, start fresh (small), inherit the deadline if it is still ahead, and get no deadline if the parent was overdue (deliberate: splitting should make a thing approachable, not hatch several uncomfortable creatures).
- **Add** (the + button): title, optional deadline. Drops in from the top at half size and inflates.
- **Edit**: title and deadline. Removing a deadline makes it awake; the mood and size follow on the next tick.
- First launch seeds six demo tasks (`demoTasks`) covering all three moods so the states can be seen at once. They live in localStorage after that.

## Verification

```sh
npm test            # 15 physics + 9 domain tests
npm run build       # tsc --noEmit && vite build
CHROME_PATH=/run/current-system/sw/bin/google-chrome npm run test:browser
```

All pass. The browser tests wait for `domcontentloaded` rather than `load`, because the Google Fonts stylesheet never resolves inside the sandboxed Chrome. Also: inside the agent sandbox the headless Chrome silently drops every synthetic mouse and keyboard event (CDP input), so the Playwright suite must be run outside the sandbox; the physics and domain tests are fine inside it.

Physics tests were adjusted for the taller jar: preset drop heights in `World.CAST` are now relative to the floor, and the drag scenarios use floor-relative targets. One real observation: a big creature dropped onto small ones from the top of the tall jar arches over them (about 7 percent trapped) where a release just above the pile sinks in (2.7 percent). The test pins the latter. The app never drops big creatures (newcomers arrive small and inflate), so this only affects the playground.

## The crowded-jar episode (read before touching sizes or load)

After the debug buttons aged several tasks to max size, the user's jar became a wall-to-wall pack of slabs, one with a lobe, and it oozed. Three causes, two fixed:

1. **Load dropped everyone at once, small, from the top, and inflated them in a heap.** The memory foam remembered the heap. Fixed: `Jar.tsx` now builds the pile before the first frame like the playground presets do, one creature at a time at full size, 40 steps between drops and 120 after (the user's diagnosis). The order is a stable shuffle keyed on task ids: the user did not want biggest-first, they want big and small mingled. Costs well under a second for ten creatures.
2. **`APP_CAPACITY` was 0.9**, the squish preset's density, all the time. Now 0.8; residual drift after settling measured a third of the 0.9 case.
3. **Several soft giants leaning on each other is mush by nature.** The approved material has one balloon among firm cushions. Three balloons (radius 118, retention 0.067) flatten each other into slabs and can grow lobes. A bound on how far the memory may creep from round (`memoryRange`) was tried: 0.15 removed lobes but destroyed the wrap (squish preset 2.1 to 6.8 percent), 0.35 barely trimmed lobes and still cost a point. Removed; the material is exactly the approved one. If lobes come back, the levers are `SIZE.freeMax` (fewer balloons) and `APP_CAPACITY`, not the material. `tests/crowd.ts` reproduces the scenario and prints lobe reach and drift.

## Open things for the user to react to

- The set-free float and the split pop are first passes. Ideas not yet tried: a brief jar-wide "exhale" (neighbours puff a touch as the space opens), haptics on native, sound.
- Sizes: `SIZE` in `src/tasks.ts` is the whole tuning surface. The user said the overdue max should not be huge; 82 against a free max of 118 is the current call.
- Copy throughout the sheets and toasts is placeholder-quality.
- Undo exists for set free only; no undo for split or edit.
- Recurrence, export/import, and IndexedDB from milestone 3 are not started.
- Time travel for the app (the old prototype had a slider) would help demoing sleep and overdue transitions; the demo seeds cover the states statically instead.
