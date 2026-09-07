import React, { useEffect, useRef, useState } from "react";
import { World, LEFT, RIGHT, TOP, JAR_AREA, CAPACITY } from "./physics";
import { mountScene, SQUEEZED } from "./scene";
import type { SceneController } from "./scene";

/** The original demo: the physics on its own terms, with dragging, the three
 * north-star presets, and a grow button. Nothing here is saved. */
export function Playground() {
  const [world] = useState<World>(() => {
    const w = new World();
    w.preset();
    return w;
  });
  const host = useRef<HTMLDivElement>(null),
    controller = useRef<SceneController | null>(null);
  const [, refresh] = useState(0),
    [stage, setStage] = useState(0),
    [paused, setPaused] = useState(false),
    [notice, setNotice] = useState("Grab a little guy. See what happens."),
    [error, setError] = useState("");
  const update = () => refresh((n) => n + 1);
  useEffect(() => {
    let disposed = false;
    mountScene(host.current!, world, { interactive: true, onSelect: update })
      .then((c) => {
        if (disposed) c.destroy();
        else controller.current = c;
      })
      .catch(() =>
        setError(
          "The jar couldn’t start WebGL. Try a browser with hardware acceleration enabled.",
        ),
      );
    let previousStatus = "";
    const timer = setInterval(() => {
      const status = `${world.selected}:${world.blobs.map((b) => `${b.id}:${b.removing}:${(b.radius / b.base).toFixed(2)}:${b.pressure > SQUEEZED}`).join()}`;
      if (status !== previousStatus) {
        previousStatus = status;
        update();
      }
    }, 200);
    return () => {
      disposed = true;
      controller.current?.destroy();
      clearInterval(timer);
    };
  }, [world]);
  const selected = world.blobs.find((b) => b.id === world.selected);
  const preset = (i: number) => {
    world.preset(i);
    setStage(i);
    setNotice(
      ["A soft little pile.", "Growing means making room.", "Um… sorry, everyone."][i],
    );
    update();
  };
  return (
    <div className="jar-screen playground">
      <div className="bar top">
        <div className="presets" aria-label="Crowding presets">
          {["Settled in", "A little crowded", "A bit of a squish"].map((label, i) => (
            <button
              key={label}
              className={stage === i ? "chosen" : ""}
              aria-pressed={stage === i}
              onClick={() => preset(i)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="bar-button small"
          onClick={() => {
            controller.current?.setPaused(!paused);
            setPaused(!paused);
          }}
        >
          {paused ? "▶ Resume" : "Ⅱ Pause"}
        </button>
      </div>
      <div className="stage">
        <div className="canvas-host" ref={host}>
          {error && <p role="alert">{error}</p>}
        </div>
      </div>
      <p className="caption" role="status">
        {notice}
      </p>
      <div className="bar bottom">
        <span className="bar-caption left">
          {selected ? selected.title : "Nobody picked"}
        </span>
        <div className="actions">
          <button
            onClick={() => {
              if (!selected) return;
              setNotice(
                world.grow(selected.id)
                  ? "A little bigger. Everyone makes room."
                  : "That’s about as much as this jar can hold.",
              );
              update();
            }}
            disabled={!selected || selected.removing || paused}
          >
            Grow ↗
          </button>
          <button
            className="done"
            onClick={() => {
              if (!selected) return;
              world.complete(selected.id);
              setNotice("And… exhale. A little room comes back.");
              update();
            }}
            disabled={!selected || selected.removing || paused}
          >
            All done ✓
          </button>
          <button
            onClick={() => {
              if (paused) return;
              const total = world.blobs.reduce(
                (s, b) => s + Math.PI * b.target * b.target,
                0,
              );
              const radius = 38 + (world.nextId % 3) * 9;
              if (total + Math.PI * radius * radius > JAR_AREA * CAPACITY) {
                setNotice("A full little jar. Complete one to make room.");
                return;
              }
              const b = world.add(
                "A new little thing",
                LEFT + 70 + ((world.nextId * 83) % (RIGHT - LEFT - 140)),
                TOP + 70,
                radius,
              );
              if (b) {
                world.selected = b.id;
                setNotice("Incoming. Make a little room.");
              } else setNotice("That’s plenty for this little playground.");
              update();
            }}
            disabled={paused}
            aria-label="Drop a new blob"
          >
            +
          </button>
          <button onClick={() => preset(0)} aria-label="Reset the pile">
            ↺
          </button>
        </div>
      </div>
    </div>
  );
}
