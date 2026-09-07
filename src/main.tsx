import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Jar } from "./Jar";
import { Playground } from "./Playground";
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
      </header>
      {tab === "jar" ? <Jar /> : <Playground />}
    </div>
  );
}
createRoot(document.getElementById("app")!).render(<App />);
