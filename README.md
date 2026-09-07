# gnaw

Things you haven't done take up room in your head. gnaw puts them in a jar as soft little creatures that grow while they wait, sleep until their deadline, squirm once it passes, and float away when you set them free. Split a big one into smaller steps and it pops into small ones.

**Status:** early build. Physics and the first task layer work; everything else is experimentation.

```sh
npm install
npm run dev
```

Tap a creature to edit it, split it, or set it free. Add one with the + button, with or without a deadline. The Playground tab is the bare physics with dragging.

Tasks live in the browser until you sign in (Google, Apple, or an email and password). Signed in, the jar is kept in a Cloudflare D1 database and every device you sign in on sees the same creatures. The browser copy stays as a cache, so the jar opens instantly and works offline; changes are pushed when there is a connection.

`npm run dev` runs the app and the Worker together, with a local D1 under `.wrangler/state`. Copy `.dev.vars.example` to `.dev.vars` first and run `npm run db:migrate` once. `npm test` runs the physics, task-domain and sync checks; `npm run test:browser` runs Playwright; `npm run deploy` builds and ships to Cloudflare. See [docs/HANDOFF.md](docs/HANDOFF.md) for the design rules and the account setup, and [docs/ROADMAP.md](docs/ROADMAP.md) for where this is going.
