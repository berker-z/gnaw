/** The Worker: better-auth under /api/auth, task sync under /api/tasks, and
 * the built app as static assets for everything else. */
import { Hono } from "hono";
import { getAuth } from "./auth";
import type { AuthEnv } from "./auth";
import { isEmpty, sync } from "./tasks";
import { isSyncRequest } from "../src/protocol";

type Env = AuthEnv & { ASSETS: Fetcher };
type Vars = { userId: string };

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.on(["GET", "POST"], "/api/auth/*", (c) =>
  getAuth(c.env, new URL(c.req.url).origin).handler(c.req.raw),
);

app.use("/api/tasks/*", async (c, next) => {
  const auth = getAuth(c.env, new URL(c.req.url).origin);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Sign in first." }, 401);
  c.set("userId", session.user.id);
  await next();
});

app.post("/api/tasks/sync", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!isSyncRequest(body)) return c.json({ error: "Bad request." }, 400);
  return c.json(await sync(c.env.DB, c.get("userId"), body.since, body.changes));
});

app.get("/api/tasks/empty", async (c) =>
  c.json({ empty: await isEmpty(c.env.DB, c.get("userId")) }),
);

app.get("/api/health", (c) => c.json({ ok: true }));

app.notFound((c) => c.json({ error: "Not found." }, 404));

export default app;
