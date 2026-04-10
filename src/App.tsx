import { useState, useRef } from "react";
import { refractive, convex, lip } from "@hashintel/refractive";
import { useDrag } from "@use-gesture/react";
import clsx from "clsx";
import "./App.css";

/* ─── Utilities ─── */

function rubberBand(overshoot: number, limit: number) {
  return limit * (1 - Math.exp(-overshoot / limit));
}

function rubberBandClamp(val: number, min: number, max: number, limit: number) {
  if (val < min) return min - rubberBand(min - val, limit);
  if (val > max) return max + rubberBand(val - max, limit);
  return val;
}

const BG = 26; // dark bg #1a1a1a
function opaqueOn(r: number, g: number, b: number, a: number) {
  return `rgb(${Math.round(BG + (r - BG) * a)},${Math.round(BG + (g - BG) * a)},${Math.round(BG + (b - BG) * a)})`;
}

const TRACK_ON = opaqueOn(59, 191, 78, 0.93);
const TRACK_OFF = opaqueOn(120, 120, 128, 0.32);
const TRACK_RGBA = { off: [120, 120, 128, 0.32], on: [59, 191, 78, 0.93] };

/* ─── Refraction parameters ─── */

const PARAM_CONFIG = [
  { key: "specular", label: "Specular Opacity", min: 0, max: 1, step: 0.01 },
  { key: "refraction", label: "Refraction Level", min: 0, max: 1, step: 0.01 },
  { key: "blur", label: "Blur Level", min: 0, max: 40, step: 0.1 },
] as const;

type ParamKey = (typeof PARAM_CONFIG)[number]["key"];
type ParamValues = Record<ParamKey, number>;

function useRefractionParams(defaults: ParamValues) {
  const [params, setParams] = useState(defaults);
  const set = (key: ParamKey) => (v: number) => setParams(p => ({ ...p, [key]: v }));
  return { params, set };
}

function Params({ params, set }: ReturnType<typeof useRefractionParams>) {
  return (
    <div className="params-section">
      <div className="params-header">
        <div className="params-title">Parameters</div>
        <div className="params-line" />
      </div>
      {PARAM_CONFIG.map(({ key, label, min, max, step }) => {
        const v = params[key];
        const display = step < 1 ? v.toFixed(2) : step < 10 ? v.toFixed(1) : String(v);
        return (
          <div key={key} className="param-row">
            <label className="param-label">{label}</label>
            <span className="param-value">{display}</span>
            <input type="range" min={min} max={max} step={step} value={v}
              onChange={e => set(key)(Number(e.target.value))} className="param-slider" aria-label={label} />
          </div>
        );
      })}
    </div>
  );
}

function refraction(p: ParamValues, extra: object) {
  return {
    blur: p.blur, glassThickness: p.refraction * 70, refractiveIndex: 1.5,
    specularOpacity: p.specular, ...extra,
  };
}

/* ═══════════════════════ SWITCH ═══════════════════════ */

function SwitchDemo() {
  const [active, setActive] = useState(true);
  const [useImage, setUseImage] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [thumbX, setThumbX] = useState(0);
  const { params, set } = useRefractionParams({ specular: 0.5, refraction: 1.0, blur: 0.2 });

  const maxX = 57.9;

  const bind = useDrag(({ down, movement: [mx] }) => {
    setPressed(down);
    if (!down) {
      if (Math.abs(mx) < 5) { setActive(a => !a); return; }
      const clamped = Math.max(0, Math.min(maxX, (active ? maxX : 0) + mx));
      setActive(clamped > maxX / 2);
      return;
    }
    setThumbX(rubberBandClamp((active ? maxX : 0) + mx, 0, maxX, 40));
  }, { pointer: { capture: true } });

  const displayX = pressed ? thumbX : active ? maxX : 0;
  const ratio = Math.max(0, Math.min(1, displayX / maxX));

  const trackColor = (() => {
    if (!pressed) return active ? TRACK_ON : TRACK_OFF;
    const [r, g, b, a] = TRACK_RGBA.off.map((v, i) => v + (TRACK_RGBA.on[i] - v) * ratio);
    return opaqueOn(Math.round(r), Math.round(g), Math.round(b), a);
  })();

  return (
    <div className="component-section">
      <h2 className="section-heading">Switch</h2>
      <p className="section-description">
        This uses a lip bezel, which makes the surface convex on the outside and
        concave in the middle. This makes the center slider zoomed out, while the
        edges refract the inside.
      </p>
      <div className={clsx("demo-container demo-touch-none", useImage && "demo-image-bg")}>
        <div {...bind()} className="switch-track" style={{ backgroundColor: trackColor }}>
          <refractive.div
            className={clsx("switch-thumb", pressed && "switch-thumb-pressed")}
            style={{
              transform: `translateX(${displayX}px) translateY(-50%) scale(${pressed ? 1.0 : 0.65})`,
              backgroundColor: pressed ? "rgba(255,255,255,0.15)" : "#fff",
            }}
            refraction={refraction(params, { radius: 46, bezelWidth: 18, bezelHeightFn: lip })}
          />
        </div>
        <label className="demo-checkbox">
          <input type="checkbox" checked={useImage} onChange={e => setUseImage(e.target.checked)} />
          Use background image
        </label>
      </div>
      <Params params={params} set={set} />
    </div>
  );
}

/* ═══════════════════════ SLIDER ═══════════════════════ */

function SliderDemo() {
  const [value, setValue] = useState(10);
  const [pressed, setPressed] = useState(false);
  const [useImage, setUseImage] = useState(false);
  const [motionMode, setMotionMode] = useState<"smooth" | "instant">("smooth");
  const { params, set } = useRefractionParams({ specular: 0.4, refraction: 1.0, blur: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trackWidth = 330;

  const pctFromClient = (clientX: number) => {
    const rect = wrapperRef.current!.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * 100;
  };

  const [rawPct, setRawPct] = useState(10);

  const bind = useDrag(({ down, first, xy: [x], movement: [mx] }) => {
    if (first) {
      if (releaseTimer.current) { clearTimeout(releaseTimer.current); releaseTimer.current = null; }
      setPressed(true);
      setMotionMode("smooth");
      const pct = Math.max(0, Math.min(100, pctFromClient(x)));
      setValue(Math.round(pct));
      setRawPct(pct);
    }

    if (!first && Math.abs(mx) >= 5) setMotionMode("instant");

    if (!first && down) {
      const pct = pctFromClient(x);
      setRawPct(rubberBandClamp(pct, 0, 100, 8));
      setValue(Math.round(Math.max(0, Math.min(100, pct))));
    }

    if (!down) {
      setMotionMode("smooth");
      setRawPct(Math.max(0, Math.min(100, pctFromClient(x))));
      if (Math.abs(mx) >= 5) {
        setPressed(false);
      } else {
        releaseTimer.current = setTimeout(() => { setPressed(false); releaseTimer.current = null; }, 400);
      }
    }
  }, { pointer: { capture: true } });

  const thumbLeft = (pressed ? rawPct : value) / 100 * trackWidth;
  const dragging = motionMode === "instant";
  const thumbMode = pressed ? (dragging ? "dragging" : "smooth") : "";

  return (
    <div className="component-section">
      <h2 className="section-heading">Slider</h2>
      <p className="section-description">
        Slider allows you to see the current level through the glass, while the
        sides refract the background. It uses a convex bezel.
      </p>
      <div className={clsx("demo-container", useImage && "demo-image-bg")}>
        <div {...bind()} className="slider-wrapper" ref={wrapperRef}>
          <div className="slider-track">
            <div className="slider-track-inner">
              <div className={clsx("slider-fill", dragging && "slider-fill-dragging")} style={{ width: `${value}%` }} />
            </div>
          </div>
          <refractive.div
            className={clsx("slider-thumb", thumbMode && `slider-thumb-${thumbMode}`, pressed && "slider-thumb-active")}
            style={{
              left: `${thumbLeft}px`,
              transform: `scale(${pressed ? 0.9 : 0.6})`,
              backgroundColor: pressed ? "rgba(255,255,255,0.12)" : "#fff",
            }}
            refraction={refraction(params, { radius: 30, bezelWidth: 14, bezelHeightFn: convex })}
          />
        </div>
        <label className="demo-checkbox">
          <input type="checkbox" checked={useImage} onChange={e => setUseImage(e.target.checked)} />
          Use background image
        </label>
      </div>
      <Params params={params} set={set} />
    </div>
  );
}

/* ═══════════════════════ APP ═══════════════════════ */

export default function App() {
  return (
    <div className="app dark">
      <header className="app-header">
        <h1>Liquid Glass Components</h1>
        <p className="subtitle">
          Recreating Apple's WWDC 2025 Liquid Glass effect with{" "}
          <a href="https://github.com/hashintel/hash/tree/main/libs/%40hashintel/refractive" target="_blank" rel="noreferrer">
            @hashintel/refractive
          </a>
        </p>
        <p className="chrome-badge">Chrome / Chromium only</p>
      </header>
      <main className="app-main">
        <SwitchDemo />
        <SliderDemo />
      </main>
      <footer className="app-footer">
        Based on{" "}
        <a href="https://kube.io/blog/liquid-glass-css-svg" target="_blank" rel="noreferrer">kube.io</a>
      </footer>
    </div>
  );
}
