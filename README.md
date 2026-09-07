# gnaw

Things you haven't done take up room in your head. gnaw puts them in a jar as soft little creatures that grow while they wait, sleep until their deadline, squirm once it passes, and float away when you set them free. Split a big one into smaller steps and it pops into small ones.

**Status:** early build. Physics and the first task layer work; everything else is experimentation.

```sh
npm install
npm run dev
```

Tap a creature to edit it, split it, or set it free. Add one with the + button, with or without a deadline. Tasks are saved in the browser. The Playground tab is the bare physics with dragging.

`npm test` runs the physics and task-domain checks; `npm run test:browser` runs Playwright. See [HANDOFF.md](HANDOFF.md) for the design rules and [ROADMAP.md](ROADMAP.md) for where this is going.
