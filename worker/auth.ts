/** better-auth, configured from the Worker's bindings. Google and Apple are
 * switched on only when their secrets are present, so a fresh checkout works
 * with email and password alone. */
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";

export type AuthEnv = {
  DB: D1Database;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
  APPLE_APP_BUNDLE_IDENTIFIER?: string;
};

const cache = new Map<string, ReturnType<typeof build>>();

/** One instance per origin per isolate. Bindings are stable within an
 * isolate, so reusing the instance across requests is safe and saves the
 * setup cost on every call. */
export function getAuth(env: AuthEnv, origin: string) {
  const baseURL = env.BETTER_AUTH_URL || origin;
  let auth = cache.get(baseURL);
  if (!auth) {
    auth = build(env, baseURL);
    cache.set(baseURL, auth);
  }
  return auth;
}

function build(env: AuthEnv, baseURL: string) {
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
      : undefined;
  const apple =
    env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET
      ? {
          clientId: env.APPLE_CLIENT_ID,
          clientSecret: env.APPLE_CLIENT_SECRET,
          // Native iOS signs in with an ID token whose audience is the app's
          // bundle id, not the web Services ID.
          appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER,
        }
      : undefined;
  return betterAuth({
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    // better-auth recognises a D1 binding and brings its own SQLite dialect.
    database: env.DB,
    emailAndPassword: {
      enabled: true,
      // No mail provider yet, so nothing to verify with. Flip this on, add
      // sendVerificationEmail and sendResetPassword, once one exists.
      requireEmailVerification: false,
      minPasswordLength: 8,
    },
    socialProviders: {
      ...(google ? { google } : {}),
      ...(apple ? { apple } : {}),
    },
    user: {
      deleteUser: {
        enabled: true,
        // The task table cascades on the user's foreign key, but D1's
        // foreign-key enforcement is not something to bet a privacy policy
        // on. Remove the tasks ourselves first.
        beforeDelete: async (user) => {
          await env.DB.prepare("DELETE FROM task WHERE userId = ?1")
            .bind(user.id)
            .run();
        },
      },
    },
    session: {
      // Sessions live a month and are refreshed daily. The cookie carries a
      // signed copy for five minutes, so most requests never touch D1.
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    // Apple posts the callback from its own origin. The custom scheme is for
    // the native shells later; harmless until then.
    trustedOrigins: [baseURL, "https://appleid.apple.com", "gnaw://"],
    // Native shells send `Authorization: Bearer <token>` instead of cookies.
    plugins: [bearer()],
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
    },
  });
}

export type Auth = ReturnType<typeof build>;
