/** The account sheet: sign in with Google, Apple or an email and password;
 * signed in, who you are, how the sync is doing, and a way out. */
import React, { useState } from "react";
import { Sheet } from "./Sheet";
import { authClient, PROVIDERS } from "./auth-client";
import type { Session } from "./auth-client";
import { cacheKey } from "./sync";
import type { SyncStatus } from "./sync";
import { relative } from "./tasks";

const describeSync = (s: SyncStatus, now: number) => {
  const waiting = s.pending ? ` ${s.pending} change${s.pending === 1 ? "" : "s"} waiting.` : "";
  switch (s.state) {
    case "local":
      return "Kept on this device only.";
    case "syncing":
      return "Syncing…";
    case "synced":
      return `Synced ${s.at ? relative(s.at, now) : "just now"}.${waiting}`;
    case "offline":
      return `Offline. Changes will sync when you’re back.${waiting}`;
    case "signed-out":
      return "Your session ended. Sign in again to keep syncing.";
    case "error":
      return `Couldn’t sync: ${s.message ?? "unknown error"}.${waiting}`;
  }
};

export function Account({
  open,
  onClose,
  session,
  status,
  onSync,
}: {
  open: boolean;
  onClose: () => void;
  session: Session | null;
  status: SyncStatus;
  onSync: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fail = (message?: string) =>
    setError(message || "That didn’t work. Try again.");

  const social = async (provider: "google" | "apple") => {
    setBusy(true);
    setError("");
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: location.origin + location.pathname,
    });
    if (error) {
      setBusy(false);
      fail(error.message);
    }
    // Otherwise the browser is on its way to the provider.
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } =
      mode === "signup"
        ? await authClient.signUp.email({
            email,
            password,
            name: name.trim() || email.split("@")[0],
          })
        : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (error) fail(error.message);
    else onClose();
  };

  const signOut = async () => {
    setBusy(true);
    await authClient.signOut();
    setBusy(false);
    onClose();
  };

  const [deleting, setDeleting] = useState(false);
  const deleteAccount = async () => {
    if (!session) return;
    setBusy(true);
    setError("");
    const userId = session.user.id;
    const { error } = await authClient.deleteUser();
    setBusy(false);
    if (error) return fail(error.message);
    // The account is gone; so is this device's copy of its jar.
    try {
      localStorage.removeItem(cacheKey(userId));
    } catch {}
    setDeleting(false);
    onClose();
  };

  if (session)
    return (
      <Sheet open={open} onClose={onClose} label="Your account">
        <p className="eyebrow">Signed in</p>
        <h2>{session.user.name || session.user.email}</h2>
        <p className="meta">{session.user.email}</p>
        <p className="meta faint" role="status">
          {describeSync(status, Date.now())}
        </p>
        {deleting ? (
          <>
            <p className="meta error" role="alert">
              This removes your account and every task in it, on every
              device. There is no undo.
            </p>
            {error && (
              <p className="meta error" role="alert">
                {error}
              </p>
            )}
            <div className="sheet-actions">
              <button onClick={() => setDeleting(false)} disabled={busy}>
                Keep it
              </button>
              <button className="danger" onClick={deleteAccount} disabled={busy}>
                Delete for good
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="sheet-actions">
              <button onClick={() => void onSync()} disabled={status.state === "syncing"}>
                Sync now
              </button>
              <button onClick={signOut} disabled={busy}>
                Sign out
              </button>
            </div>
            <p className="meta faint">
              Signing out keeps this device’s copy. Signing in again brings it
              back up to date.
            </p>
            <p className="meta faint">
              <button type="button" className="link" onClick={() => setDeleting(true)}>
                Delete my account
              </button>
              {" · "}
              <a className="link" href="/privacy">
                Privacy
              </a>
              {" · "}
              <a className="link" href="/terms">
                Terms
              </a>
            </p>
          </>
        )}
      </Sheet>
    );

  return (
    <Sheet open={open} onClose={onClose} label="Sign in">
      <p className="eyebrow">Account</p>
      <h2>{mode === "signup" ? "Make an account" : "Sign in"}</h2>
      <p className="meta">
        Your jar follows you: every device you sign in on sees the same
        creatures. Until then it lives on this device only.
      </p>
      <div className="providers">
        {PROVIDERS.google && (
          <button className="provider" onClick={() => social("google")} disabled={busy}>
            <span className="provider-mark" aria-hidden>
              G
            </span>
            Continue with Google
          </button>
        )}
        {PROVIDERS.apple && (
          <button className="provider" onClick={() => social("apple")} disabled={busy}>
            <span className="provider-mark" aria-hidden>

            </span>
            Continue with Apple
          </button>
        )}
      </div>
      <p className="meta faint divider">
        <span>or with email</span>
      </p>
      <form className="task-form" onSubmit={submit}>
        {mode === "signup" && (
          <label>
            Name <small>(optional)</small>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="What the jar should call you"
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
          />
        </label>
        <label>
          Password <small>(8 or more)</small>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </label>
        {error && (
          <p className="meta error" role="alert">
            {error}
          </p>
        )}
        <div className="sheet-actions">
          <button className="primary" type="submit" disabled={busy}>
            {mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </div>
        <p className="meta faint">
          By continuing you agree to the{" "}
          <a className="link" href="/terms">
            terms
          </a>{" "}
          and the{" "}
          <a className="link" href="/privacy">
            privacy policy
          </a>
          .
        </p>
        <p className="meta">
          {mode === "signup" ? "Already have one? " : "New here? "}
          <button
            type="button"
            className="link"
            onClick={() => {
              setMode(mode === "signup" ? "signin" : "signup");
              setError("");
            }}
          >
            {mode === "signup" ? "Sign in instead" : "Make an account"}
          </button>
        </p>
      </form>
    </Sheet>
  );
}
