import { useState, useCallback, useRef } from "react";
import { refractive, convex, lip } from "@hashintel/refractive";
import "./App.css";

/* ─── Param helpers ─── */

// iOS-style rubber band: overshoot decays logarithmically
function rubberBand(overscroll: number, limit: number): number {
  return limit * (1 - Math.exp(-overscroll / limit));
}
function ParamRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const display =
    step < 1 ? value.toFixed(2) : step < 10 ? value.toFixed(1) : String(value);
  return (
    <div className="param-row">
      <label className="param-label">{label}</label>
      <span className="param-value">{display}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="param-slider"
        aria-label={label}
      />
    </div>
  );
}

function ParamSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="params-section">
      <div className="params-header">
        <div className="params-title">Parameters</div>
        <div className="params-line" />
      </div>
      {children}
    </div>
  );
}

/* ═══════════════════════ SEARCHBOX ═══════════════════════ */
function SearchBox() {
  const [query, setQuery] = useState("");
  const [specularOpacity, setSpecularOpacity] = useState(0.2);
  const [refractionLevel, setRefractionLevel] = useState(0.7);
  const [blurLevel, setBlurLevel] = useState(1);
  const [useImage, setUseImage] = useState(false);

  return (
    <div className="component-section">
      <h2 className="section-heading">Searchbox</h2>
      <div className={"demo-container" + (useImage ? " demo-image-bg" : "")}>
        <div className="searchbox-wrapper">
          <refractive.div
            className="searchbox-glass"
            refraction={{
              radius: 28,
              blur: blurLevel,
              bezelWidth: 14,
              glassThickness: refractionLevel * 70,
              refractiveIndex: 1.5,
              specularOpacity,
              bezelHeightFn: convex,
            }}
          />
          <div className="searchbox-content">
            <svg
              className="search-icon"
              stroke="currentColor"
              fill="currentColor"
              strokeWidth="0"
              viewBox="0 0 512 512"
              aria-hidden="true"
              height="20"
              width="20"
            >
              <path d="M456.69 421.39 362.6 327.3a173.81 173.81 0 0 0 34.84-104.58C397.44 126.38 319.06 48 222.72 48S48 126.38 48 222.72s78.38 174.72 174.72 174.72A173.81 173.81 0 0 0 327.3 362.6l94.09 94.09a25 25 0 0 0 35.3-35.3zM97.92 222.72a124.8 124.8 0 1 1 124.8 124.8 124.95 124.95 0 0 1-124.8-124.8z" />
            </svg>
            <input
              type="search"
              placeholder="Search"
              aria-label="Search"
              className="search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <label className="demo-checkbox">
          <input
            type="checkbox"
            checked={useImage}
            onChange={(e) => setUseImage(e.target.checked)}
          />
          Use image background
        </label>
      </div>
      <ParamSection>
        <ParamRow label="Specular Opacity" value={specularOpacity} min={0} max={1} step={0.01} onChange={setSpecularOpacity} />
        <ParamRow label="Refraction Level" value={refractionLevel} min={0} max={1} step={0.01} onChange={setRefractionLevel} />
        <ParamRow label="Blur Level" value={blurLevel} min={0} max={40} step={0.1} onChange={setBlurLevel} />
      </ParamSection>
    </div>
  );
}

/* ═══════════════════════ SWITCH ═══════════════════════ */
function SwitchDemo() {
  const [active, setActive] = useState(true);
  const [forceActive, setForceActive] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [specularOpacity, setSpecularOpacity] = useState(0.5);
  const [refractionLevel, setRefractionLevel] = useState(1.0);
  const [blurLevel, setBlurLevel] = useState(0.2);

  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartActive = useRef(false);
  const dragMoved = useRef(false);
  const thumbXRef = useRef(0);
  const [thumbX, setThumbX] = useState(0);

  const isOn = forceActive || active;
  const maxThumbX = 57.9;
  const displayX = dragging.current ? thumbX : isOn ? maxThumbX : 0;

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (forceActive) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragging.current = true;
      dragMoved.current = false;
      dragStartX.current = e.clientX;
      dragStartActive.current = active;
      thumbXRef.current = active ? maxThumbX : 0;
      setThumbX(thumbXRef.current);
      setPressed(true);
    },
    [active, forceActive]
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStartX.current;
    if (Math.abs(dx) > 3) dragMoved.current = true;
    const startX = dragStartActive.current ? maxThumbX : 0;
    const raw = startX + dx;
    // Rubber band: allow overshoot with diminishing resistance
    let newX: number;
    if (raw < 0) {
      newX = -rubberBand(-raw, 40);
    } else if (raw > maxThumbX) {
      newX = maxThumbX + rubberBand(raw - maxThumbX, 40);
    } else {
      newX = raw;
    }
    thumbXRef.current = newX;
    setThumbX(newX);
  }, []);

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    setPressed(false);
    // Clamp for snap decision
    const clamped = Math.max(0, Math.min(maxThumbX, thumbXRef.current));
    if (dragMoved.current) {
      setActive(clamped > maxThumbX / 2);
    } else {
      setActive((a) => !a);
    }
  }, []);

  const trackColor = (() => {
    if (forceActive) return "rgba(59, 191, 78, 0.93)";
    if (dragging.current) {
      const ratio = Math.max(0, Math.min(1, thumbX / maxThumbX));
      const r = Math.round(120 + (59 - 120) * ratio);
      const g = Math.round(120 + (191 - 120) * ratio);
      const b = Math.round(128 + (78 - 128) * ratio);
      const a = 0.32 + (0.93 - 0.32) * ratio;
      return "rgba(" + r + "," + g + "," + b + "," + a.toFixed(2) + ")";
    }
    return isOn ? "rgba(59, 191, 78, 0.93)" : "rgba(120, 120, 128, 0.32)";
  })();

  const thumbScale = pressed ? 1.0 : 0.65;
  const thumbBg = pressed
    ? "rgba(255, 255, 255, 0.15)"
    : "rgba(255, 255, 255, 1)";

  return (
    <div className="component-section">
      <h2 className="section-heading">Switch</h2>
      <p className="section-description">
        This uses a lip bezel, which makes the surface convex on the outside and
        concave in the middle. This makes the center slider zoomed out, while the
        edges refract the inside.
      </p>
      <div className="demo-container demo-touch-none">
        <div
          className="switch-track"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ backgroundColor: trackColor }}
        >
          <refractive.div
            className={
              "switch-thumb" + (pressed ? " switch-thumb-pressed" : "")
            }
            style={{
              transform:
                "translateX(" +
                displayX +
                "px) translateY(-50%) scale(" +
                thumbScale +
                ")",
              backgroundColor: thumbBg,
            }}
            refraction={{
              radius: 46,
              blur: blurLevel,
              bezelWidth: 18,
              glassThickness: refractionLevel * 70,
              refractiveIndex: 1.5,
              specularOpacity,
              bezelHeightFn: lip,
            }}
          />
        </div>
        <label className="demo-checkbox">
          <input
            type="checkbox"
            checked={forceActive}
            onChange={(e) => setForceActive(e.target.checked)}
          />
          Force active
        </label>
      </div>
      <ParamSection>
        <ParamRow label="Specular Opacity" value={specularOpacity} min={0} max={1} step={0.01} onChange={setSpecularOpacity} />
        <ParamRow label="Refraction Level" value={refractionLevel} min={0} max={1} step={0.01} onChange={setRefractionLevel} />
        <ParamRow label="Blur Level" value={blurLevel} min={0} max={40} step={0.1} onChange={setBlurLevel} />
      </ParamSection>
    </div>
  );
}

/* ═══════════════════════ SLIDER ═══════════════════════ */
function SliderDemo() {
  const [value, setValue] = useState(10);
  const [pressed, setPressed] = useState(false);
  const [forceActive, setForceActive] = useState(false);
  const [specularOpacity, setSpecularOpacity] = useState(0.4);
  const [refractionLevel, setRefractionLevel] = useState(1.0);
  const [blurLevel, setBlurLevel] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const hasMoved = useRef(false);
  const startClientX = useRef(0);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // "smooth" = animate left (click-to-position), "instant" = no transition (dragging)
  const [motionMode, setMotionMode] = useState<"smooth" | "instant">("smooth");

  const [rawPct, setRawPct] = useState(10);
  const rawPctRef = useRef(10);

  const trackWidth = 330;

  const calcPct = useCallback((clientX: number) => {
    const el = wrapperRef.current;
    if (!el) return 10;
    const rect = el.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * 100;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (releaseTimer.current) {
        clearTimeout(releaseTimer.current);
        releaseTimer.current = null;
      }
      dragging.current = true;
      hasMoved.current = false;
      startClientX.current = e.clientX;
      wrapperRef.current?.setPointerCapture(e.pointerId);
      setPressed(true);
      setMotionMode("smooth");
      const pct = calcPct(e.clientX);
      const clamped = Math.max(0, Math.min(100, pct));
      setValue(Math.round(clamped));
      rawPctRef.current = clamped;
      setRawPct(clamped);
    },
    [calcPct]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      // Only switch to instant mode after significant movement (5px threshold)
      if (!hasMoved.current && Math.abs(e.clientX - startClientX.current) < 5) return;
      hasMoved.current = true;
      setMotionMode("instant");
      const pct = calcPct(e.clientX);
      let displayPct: number;
      if (pct < 0) {
        displayPct = -(rubberBand(-pct, 8) / 100) * 100;
      } else if (pct > 100) {
        displayPct = 100 + (rubberBand(pct - 100, 8) / 100) * 100;
      } else {
        displayPct = pct;
      }
      rawPctRef.current = displayPct;
      setRawPct(displayPct);
      setValue(Math.round(Math.max(0, Math.min(100, pct))));
    },
    [calcPct]
  );

  const onPointerUp = useCallback(() => {
    const didMove = hasMoved.current;
    dragging.current = false;
    hasMoved.current = false;
    setMotionMode("smooth");
    const clamped = Math.max(0, Math.min(100, rawPctRef.current));
    rawPctRef.current = clamped;
    setRawPct(clamped);
    if (didMove) {
      setPressed(false);
    } else {
      releaseTimer.current = setTimeout(() => {
        setPressed(false);
        releaseTimer.current = null;
      }, 400);
    }
  }, []);

  const displayPct = dragging.current ? rawPct : value;
  const thumbLeft = (displayPct / 100) * trackWidth;
  const thumbScale = pressed ? 0.9 : 0.6;
  const thumbBg = pressed
    ? "rgba(255, 255, 255, 0.12)"
    : "rgba(255, 255, 255, 1)";

  const smoothTransition = "transform 0.15s ease-out, left 0.35s cubic-bezier(0.4,0,0.2,1), background-color 0.1s ease, box-shadow 0.15s ease";
  const instantTransition = "transform 0.08s ease-out, left 0s, background-color 0.1s ease, box-shadow 0.1s ease";
  const restTransition = "transform 0.2s ease, left 0.35s cubic-bezier(0.4,0,0.2,1), background-color 0.25s ease, box-shadow 0.25s ease";

  const thumbTransition = pressed
    ? (motionMode === "instant" ? instantTransition : smoothTransition)
    : restTransition;

  const fillTransition = motionMode === "instant" ? "width 0s" : "width 0.35s cubic-bezier(0.4,0,0.2,1)";

  return (
    <div className="component-section">
      <h2 className="section-heading">Slider</h2>
      <p className="section-description">
        Slider allows you to see the current level through the glass, while the
        sides refract the background. It uses a convex bezel.
      </p>
      <div className="demo-container">
        <div
          className="slider-wrapper"
          ref={wrapperRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <div className="slider-track">
            <div className="slider-track-inner">
              <div
                className="slider-fill"
                style={{ width: value + "%", transition: fillTransition }}
              />
            </div>
          </div>
          <refractive.div
            className={
              "slider-thumb" + (pressed ? " slider-thumb-active" : "")
            }
            onPointerDown={onPointerDown}
            style={{
              left: thumbLeft + "px",
              transform: "scale(" + thumbScale + ")",
              backgroundColor: thumbBg,
              transition: thumbTransition,
            }}
            refraction={{
              radius: 30,
              blur: blurLevel,
              bezelWidth: 14,
              glassThickness: refractionLevel * 70,
              refractiveIndex: 1.5,
              specularOpacity,
              bezelHeightFn: convex,
            }}
          />
        </div>
        <label className="demo-checkbox">
          <input
            type="checkbox"
            checked={forceActive}
            onChange={(e) => setForceActive(e.target.checked)}
          />
          Force active
        </label>
      </div>
      <ParamSection>
        <ParamRow label="Specular Opacity" value={specularOpacity} min={0} max={1} step={0.01} onChange={setSpecularOpacity} />
        <ParamRow label="Refraction Level" value={refractionLevel} min={0} max={1} step={0.01} onChange={setRefractionLevel} />
        <ParamRow label="Blur Level" value={blurLevel} min={0} max={40} step={0.1} onChange={setBlurLevel} />
      </ParamSection>
    </div>
  );
}

/* App */
function App() {
  return (
    <div className="app dark">
      <header className="app-header">
        <h1>Liquid Glass Components</h1>
        <p className="subtitle">
          {"Recreating Apple\u2019s WWDC 2025 Liquid Glass effect with "}
          <a
            href="https://github.com/hashintel/hash/tree/main/libs/%40hashintel/refractive"
            target="_blank"
            rel="noreferrer"
          >
            @hashintel/refractive
          </a>
        </p>
        <p className="chrome-badge">Chrome / Chromium only</p>
      </header>

      <main className="app-main">
        <SearchBox />
        <SwitchDemo />
        <SliderDemo />
      </main>

      <footer className="app-footer">
        {"Based on "}
        <a
          href="https://kube.io/blog/liquid-glass-css-svg"
          target="_blank"
          rel="noreferrer"
        >
          kube.io
        </a>
      </footer>
    </div>
  );
}

export default App;
