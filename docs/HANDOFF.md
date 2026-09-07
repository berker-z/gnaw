# gnaw — handoff

Updated September 7, 2026, after verifying the accounts and favicon commits. Read this first in the next session; `AGENTS.md` has the rules and the immediate next steps.

September 7 Google follow-up: the user filled in the Google Web client credentials in `.dev.vars`. Uploaded only `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to the live `gnaw` Worker with `wrangler secret bulk`; both succeeded. Production and a fresh local dev server return Google authorization URLs with the matching client ID, expected callback, OAuth state and PKCE challenge. This checks initiation only; the user still needs to finish Google sign-in in their browser to verify consent, code exchange and session creation. The existing user server on port 5173 returned 404 for the social sign-in endpoint; restart `npm run dev`. The temporary server on port 5174 was stopped after checking with request host localhost:5173. No app code deployment or commit was made. The legal pages now use the public contact address chosen by the user. `.dev.vars` and environment variants are ignored, as are `.env` files; example files remain trackable.

Google client ID correction: the first browser attempt failed with 401 invalid_client. The saved ID had an `http://` prefix and trailing slash. Removed the URL wrapper in `.dev.vars` and uploaded the corrected `GOOGLE_CLIENT_ID` to Cloudflare. Verified the live authorization request uses the corrected ID. Full browser sign-in still needs user confirmation. Restart the local dev server before retrying locally.

Latest verification: all 33 tests and `npm run build` pass. The favicon links and assets are tracked. Browser tests were not rerun in this documentation follow-up. Local secrets remain ignored.

## Where things stand

**The product is called gnaw now** (the folder is still `taskblob`; do not rename it). Public repo: github.com/berker-z/gnaw. Commits are the user's own; never add any AI attribution to commits, PRs or code.

**The physics is approved and the app has started.** The user chose material F on the evening of the 7th and then asked for the first app pass: a phone-shaped jar, real task data with deadlines and moods, no dragging in the app (kept on a second tab), a modal per creature with edit / set free / split, and strong visual moments for setting free and splitting. All of that is in and passing tests. The user has been reviewing it live and giving small notes (sheepish face back, no drop on the overdue face, mixed load order, no count limit); expect more of the same on effects, copy and sizes.

Debug buttons in the Jar's bottom bar: `+?` adds a random creature of any mood, `↗?` ages a random handful by a few sizes (shifts `createdAt`), `✕?` clears the jar.

**Accounts and sync landed on the evening of the 7th** (see the section below) and are deployed at https://gnaw.gnaw.workers.dev. Accounts and sync are committed as `44766b2`; legal pages, favicon and touch icon are committed as `b615135`. Both commits are on `origin/main`, authored by berker-z. The user has not reviewed the sign-in sheet yet. Google credentials are deployed, with browser sign-in confirmation pending; Apple is parked (no paid developer account). The legal pages carry berker.zor@gmail.com as the contact address and are deployed with it.

## Accounts and sync

The app is now a Cloudflare Worker with the built site as static assets. `worker/index.ts` (Hono) mounts better-auth under `/api/auth/*` and the task sync under `/api/tasks/*`; everything else is served from `dist/client` with single-page fallback, and only `/api/*` invokes the Worker (`run_worker_first` in `wrangler.jsonc`). `npm run dev` runs all of it through `@cloudflare/vite-plugin`, with a local D1 in `.wrangler/state`. `npm run build` type-checks both sides and writes `dist/client` and `dist/gnaw`; `npm run deploy` builds and runs `wrangler deploy`.

Auth is better-auth 1.7 (`worker/auth.ts`). It takes the D1 binding directly and brings its own SQLite dialect, so there is no ORM. Email and password are on with no verification (there is no mail sender yet; `requireEmailVerification`, `sendVerificationEmail` and `sendResetPassword` are the hooks when one exists). Google and Apple switch on only when their secrets are set. Sessions last a month, refresh daily, and are cached in the cookie for five minutes so most requests never touch D1. The `bearer` plugin is in so the native shells can send `Authorization: Bearer` later, and `gnaw://` is already a trusted origin for them. The schema is hand-written in `migrations/0001_auth.sql` from better-auth's table definitions; if a plugin that needs tables is added, write its migration the same way.

Tasks are one D1 row per task per user (`migrations/0002_tasks.sql`), never deleted: a set-free task keeps its row with `deletedAt`, so other devices learn about it. Two timestamps do different jobs. `updatedAt` is stamped by the device and decides conflicts (last write wins; the upsert in `worker/tasks.ts` refuses older rows in its `WHERE`). `syncedAt` is stamped by the Worker and is the cursor devices pull from, so a device with a slow clock cannot hide its changes from the others. There is one endpoint, `POST /api/tasks/sync`: send `{since, changes}`, get back every row that landed at or after `since`. Tombstones older than a month are not sent to a device asking from zero.

On the client, `src/sync.ts` is a `TaskStore` (the interface in `src/storage.ts`, now with an optional `subscribe`). It is cache first: `load` returns the localStorage copy at once, `save` diffs the new list against the last one, stamps what changed, queues it, and pushes after 800 ms. It also pulls on start, when the tab becomes visible, when the browser comes back online, and every 90 s. The domain `Task` type did not change; the stamps live beside the cache in `gnaw.tasks.v2.<scope>`, where scope is `local` signed out or the user id signed in. The old `gnaw.tasks.v1` is migrated on first read. The pure parts (`diff`, `merge`, `adopt`, `migrateV1`) have nine tests in `tests/sync.test.ts`.

Signing in swaps the store; `main.tsx` keys the `Jar` on the scope so it remounts with a fresh `World` and builds the pile from the right cache. A signed-in store with nothing cached returns `[]` rather than `null`, so a new device does not seed demo tasks into an account. When a device signs in with a jar already on it and the account has nothing at all, the account adopts those tasks (`adopt`, checked through `GET /api/tasks/empty`); otherwise they stay in the signed-out jar. Changes from other devices arrive through `subscribe` and `Jar.applyRemote`: gone creatures leave at once, new ones drop in (or form a pile if the jar was empty, using the same one-at-a-time build as first load), renamed ones change their label.

The account sheet (`src/Account.tsx`) is reached from the top bar: "Sign in" when signed out, an initial when signed in, with an amber ring when the sync needs attention. It shows Google, Apple, and an email form with a sign-in/sign-up toggle, or, signed in, who you are, the sync status line, Sync now and Sign out. The jar waits up to 1.5 s for the session check before rendering, so a signed-in user does not see the signed-out jar flash; after that it renders whatever it has.

### Cloudflare

Live at https://gnaw.gnaw.workers.dev on the user's personal account (the workers.dev subdomain is `gnaw`), deployed the evening of the 7th. The D1 database `gnaw` (id in `wrangler.jsonc`) has both migrations applied and `BETTER_AUTH_SECRET` is set. Email sign-in works there. Google secrets are now set and OAuth initiation passes; completion in the user’s browser remains to be checked. Apple is off until its secrets exist.

To finish the providers: `wrangler secret put GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_IDENTIFIER`, and register `https://gnaw.gnaw.workers.dev/api/auth/callback/google` and `/api/auth/callback/apple` with the providers. `scripts/apple-secret.mjs` builds Apple's secret from the .p8 key; Apple caps it at six months, so it has to be regenerated twice a year. If the app moves to a real domain, change `BETTER_AUTH_URL` in `wrangler.jsonc` and the registered callbacks. New migrations: `npm run db:migrate:remote`. Ship: `npm run deploy`.

Locally, `.dev.vars` (gitignored, copy `.dev.vars.example`) holds the same names. Leave `BETTER_AUTH_URL` empty there and the Worker trusts whatever origin the request came in on, so phones on the LAN work; set it only when testing the OAuth redirects, which must match what the providers were told.

Inside the agent sandbox, wrangler cannot write its global directory: run it with `XDG_CONFIG_HOME=$TMPDIR/cfg WRANGLER_LOG_PATH=$TMPDIR/wl`, curl the dev server with `--noproxy '*'`, and keep a test server and its requests in the same shell command, because a server started in one command is not reachable from the next.

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
npm test            # 15 physics + 9 domain + 9 sync tests
npm run build       # both tsconfigs, then vite build (client + Worker)
CHROME_PATH=/run/current-system/sw/bin/google-chrome npm run test:browser
```

All pass. The browser tests wait for `domcontentloaded` rather than `load`, because the Google Fonts stylesheet never resolves inside the sandboxed Chrome. Also: inside the agent sandbox the headless Chrome silently drops every synthetic mouse and keyboard event (CDP input), so the Playwright suite must be run outside the sandbox; the physics and domain tests are fine inside it.

Physics tests were adjusted for the taller jar: preset drop heights in `World.CAST` are now relative to the floor, and the drag scenarios use floor-relative targets. One real observation: a big creature dropped onto small ones from the top of the tall jar arches over them (about 7 percent trapped) where a release just above the pile sinks in (2.7 percent). The test pins the latter. The app never drops big creatures (newcomers arrive small and inflate), so this only affects the playground.

## The crowded-jar episode (read before touching sizes or load)

After the debug buttons aged several tasks to max size, the user's jar became a wall-to-wall pack of slabs, one with a lobe, and it oozed. Three causes, two fixed:

1. **Load dropped everyone at once, small, from the top, and inflated them in a heap.** The memory foam remembered the heap. Fixed: `Jar.tsx` now builds the pile before the first frame like the playground presets do, one creature at a time at full size, 40 steps between drops and 120 after (the user's diagnosis). The order is a stable shuffle keyed on task ids: the user did not want biggest-first, they want big and small mingled. Costs well under a second for ten creatures.
2. **`APP_CAPACITY` was 0.9**, the squish preset's density, all the time. Now 0.8; residual drift after settling measured a third of the 0.9 case.
3. **Several soft giants leaning on each other is mush by nature.** The approved material has one balloon among firm cushions. Three balloons (radius 118, retention 0.067) flatten each other into slabs and can grow lobes. A bound on how far the memory may creep from round (`memoryRange`) was tried: 0.15 removed lobes but destroyed the wrap (squish preset 2.1 to 6.8 percent), 0.35 barely trimmed lobes and still cost a point. Removed; the material is exactly the approved one. If lobes come back, the levers are `SIZE.freeMax` (fewer balloons) and `APP_CAPACITY`, not the material. `tests/crowd.ts` reproduces the scenario and prints lobe reach and drift.

### Legal pages and account deletion

`public/privacy.html`, `public/terms.html` and `public/legal.css` are static assets, served at `/privacy` and `/terms` (Workers assets drop the `.html`). They describe what the app actually stores and are what Google's consent screen and, later, the app stores ask for. Both name berker.zor@gmail.com as the contact address, chosen by the user. Account deletion (`user.deleteUser` in `worker/auth.ts`, with a `beforeDelete` that removes the tasks itself rather than trusting the cascade) is behind "Delete my account" in the account sheet with an in-sheet confirmation. The sign-in form links to both pages.

The local D1 is keyed by `database_id`, so changing that id (as happened when the real database was created) leaves an empty local database: run `npm run db:migrate` again and better-auth's "Database schema mismatch" error goes away.

## Sign-in todo

- **Apple**: parked until there is a paid developer account. Then: App ID, Services ID with return URL `https://gnaw.gnaw.workers.dev/api/auth/callback/apple`, a Sign in with Apple key, `scripts/apple-secret.mjs`, three secrets. The button is in the sheet already; set `VITE_AUTH_APPLE=off` at build time to hide it meanwhile.
- **Google in the native apps**: the web client made now is also the "server client ID" the Android and iOS Google Sign-In SDKs use, so the Worker needs nothing new. What is needed per platform later: an Android client (package name plus the signing key's SHA-1) and an iOS client (bundle id) in the same Google Cloud project, and the app calls `authClient.signIn.social({ provider: "google", idToken })` with the token the SDK hands it instead of the redirect flow. Google blocks its OAuth pages inside WebViews, so the redirect flow will not work in a Capacitor shell.
- **Mail sender** (Resend or similar) for email verification and password reset; wire `sendVerificationEmail` and `sendResetPassword` in `worker/auth.ts`.

## Open things for the user to react to

- The set-free float and the split pop are first passes. Ideas not yet tried: a brief jar-wide "exhale" (neighbours puff a touch as the space opens), haptics on native, sound.
- Sizes: `SIZE` in `src/tasks.ts` is the whole tuning surface. The user said the overdue max should not be huge; 82 against a free max of 118 is the current call.
- Copy throughout the sheets and toasts is placeholder-quality.
- Undo exists for set free only; no undo for split or edit.
- Recurrence, export/import, and IndexedDB from milestone 3 are not started.
- Time travel for the app (the old prototype had a slider) would help demoing sleep and overdue transitions; the demo seeds cover the states statically instead.
