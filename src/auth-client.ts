/** The better-auth client. Same origin as the app, so cookies just work; the
 * native shells will pass a baseURL and a bearer token instead. */
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: typeof location !== "undefined" ? location.origin : undefined,
});

export type Session = typeof authClient.$Infer.Session;

/** Which sign-in buttons to show. The Worker only enables a provider when
 * its secrets are set; the client cannot see that, so it is configured at
 * build time. Both on by default: an unconfigured provider fails with a
 * clear message from the Worker rather than silently hiding. */
export const PROVIDERS = {
  google: import.meta.env.VITE_AUTH_GOOGLE !== "off",
  apple: import.meta.env.VITE_AUTH_APPLE !== "off",
};
