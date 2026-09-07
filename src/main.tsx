import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Jar } from "./Jar";
import { Playground } from "./Playground";
import { Account } from "./Account";
import { authClient } from "./auth-client";
import { createSyncStore, fetchRemote, LOCAL_SCOPE } from "./sync";
import type { SyncStatus } from "./sync";
import "./app.css";

type Tab = "jar" | "playground";

function App() {
  const [tab, setTab] = useState<Tab>(() =>
    location.hash === "#playground" ? "playground" : "jar",
  );
  const pick = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", t === "jar" ? "#" : "#playground");
  };

  const { data: raw, isPending } = authClient.useSession();
  // A dev server without the Worker answers the session check with the
  // app's own HTML. Anything that is not a real session is "signed out".
  const session = raw && typeof raw === "object" && raw.user?.id ? raw : null;
  const [account, setAccount] = useState(false);
  // Wait for the session check so a signed-in user does not see the
  // signed-out jar first, but never for long: a cold Worker or a dev server
  // without the API must not leave the jar blank.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1500);
    return () => clearTimeout(t);
  }, []);
  const ready = !isPending || waited;
  // One store per scope. Signing in or out swaps it, and the jar remounts
  // (see the key below) so the pile is rebuilt from the right cache.
  const scope = session?.user.id ?? LOCAL_SCOPE;
  const store = useMemo(
    () =>
      createSyncStore({
        scope,
        remote: scope === LOCAL_SCOPE ? null : fetchRemote(),
      }),
    [scope],
  );
  const [status, setStatus] = useState<SyncStatus>(() => store.status());
  useEffect(() => {
    const stop = store.start();
    const unwatch = store.onStatus(setStatus);
    return () => {
      stop();
      unwatch();
    };
  }, [store]);

  const initial = (session?.user.name || session?.user.email || "?")
    .trim()
    .charAt(0)
    .toUpperCase();
  const attention =
    status.state === "offline" || status.state === "error" || status.state === "signed-out";

  return (
    <div className="phone">
      <header className="bar top">
        <span className="logo">
          <span className="logo-face">• •</span>gnaw
        </span>
        <nav className="tabs" aria-label="Screens">
          <button
            className={tab === "jar" ? "chosen" : ""}
            aria-pressed={tab === "jar"}
            onClick={() => pick("jar")}
          >
            Jar
          </button>
          <button
            className={tab === "playground" ? "chosen" : ""}
            aria-pressed={tab === "playground"}
            onClick={() => pick("playground")}
          >
            Playground
          </button>
        </nav>
        <button
          className={`account-button ${session ? "in" : ""} ${attention ? "attention" : ""}`}
          onClick={() => setAccount(true)}
          aria-label={session ? "Your account" : "Sign in"}
          title={session ? session.user.email : "Sign in"}
        >
          {session ? initial : "Sign in"}
        </button>
      </header>
      {tab === "jar" ? (
        ready ? (
          <Jar key={scope} store={store} />
        ) : (
          <div className="jar-screen" />
        )
      ) : (
        <Playground />
      )}
      <Account
        open={account}
        onClose={() => setAccount(false)}
        session={session}
        status={status}
        onSync={store.sync}
      />
    </div>
  );
}
createRoot(document.getElementById("app")!).render(<App />);
