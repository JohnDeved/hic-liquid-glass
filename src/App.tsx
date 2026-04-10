import { useState, useCallback, useRef } from "react";
import { refractive, convex, lip } from "@hashintel/refractive";
import { useDrag } from "@use-gesture/react";
import "./App.css";

/* ─── Shared hooks ─── */

function useRefractionParams(defaults: { specular: number; refraction: number; blur: number }) {
  const [specularOpacity, setSpecularOpacity] = useState(defaults.specular);
  const [refractionLevel, setRefractionLevel] = useState(defaults.refraction);
  const [blurLevel, setBlurLevel] = useState(defaults.blur);
  return { specularOpacity, setSpecularOpacity, refractionLevel, setRefractionLevel, blurLevel, setBlurLevel };
}

function rubberBand(overshoot: number, limit: number) {
  return limit * (1 - Math.exp(-overshoot / limit));
}

// Composite rgba onto dark bg (#1a1a1a) to get an opaque equivalent
const BG = 26; // #1a1a1a
function opaqueOn(r: number, g: number, b: number, a: number) {
  return `rgb(${Math.round(BG + (r - BG) * a)},${Math.round(BG + (g - BG) * a)},${Math.round(BG + (b - BG) * a)})`;
}

/* ─── UI helpers ─── */

function ParamRow({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  const display = step < 1 ? value.toFixed(2) : step < 10 ? value.toFixed(1) : String(value);
  return (
    <div className="param-row">
      <label className="param-label">{label}</label>
      <span className="param-value">{display}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} className="param-slider" aria-label={label} />
    </div>
  );
}

function Params({ params }: { params: ReturnType<typeof useRefractionParams> }) {
  return (
    <div className="params-section">
      <div className="params-header">
        <div className="params-title">Parameters</div>
        <div className="params-line" />
      </div>
      <ParamRow label="Specular Opacity" value={params.specularOpacity} min={0} max={1} step={0.01} onChange={params.setSpecularOpacity} />
      <ParamRow label="Refraction Level" value={params.refractionLevel} min={0} max={1} step={0.01} onChange={params.setRefractionLevel} />
      <ParamRow label="Blur Level" value={params.blurLevel} min={0} max={40} step={0.1} onChange={params.setBlurLevel} />
    </div>
  );
}

/* ═══════════════════════ SWITCH ═══════════════════════ */

function SwitchDemo() {
  const [active, setActive] = useState(true);
  const [useImage, setUseImage] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [thumbX, setThumbX] = useState(0);
  const params = useRefractionParams({ specular: 0.5, refraction: 1.0, blur: 0.2 });

  const maxX = 57.9;
  const isOn = active;
  const dragged = useRef(false);

  const bind = useDrag(({ down, movement: [mx], first }) => {
    if (first) dragged.current = false;
    setPressed(down);

    if (!down) {
      if (Math.abs(mx) < 5) { setActive(a => !a); return; }
      const startX = active ? maxX : 0;
      const clamped = Math.max(0, Math.min(maxX, startX + mx));
      setActive(clamped > maxX / 2);
      return;
    }

    dragged.current = true;
    const startX = active ? maxX : 0;
    const raw = startX + mx;
    const x = raw < 0 ? -rubberBand(-raw, 40)
      : raw > maxX ? maxX + rubberBand(raw - maxX, 40)
      : raw;
    setThumbX(x);
  }, { pointer: { capture: true } });

  const displayX = pressed ? thumbX : isOn ? maxX : 0;

  const trackColor = (() => {
    const ratio = Math.max(0, Math.min(1, displayX / maxX));
    if (!pressed) {
      return isOn ? opaqueOn(59, 191, 78, 0.93) : opaqueOn(120, 120, 128, 0.32);
    }
    const r = Math.round(120 + (59 - 120) * ratio);
    const g = Math.round(120 + (191 - 120) * ratio);
    const b = Math.round(128 + (78 - 128) * ratio);
    const a = 0.32 + 0.61 * ratio;
    return opaqueOn(r, g, b, a);
  })();

  const scale = pressed ? 1.0 : 0.65;
  const bg = pressed ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,1)";

  return (
    <div className="component-section">
      <h2 className="section-heading">Switch</h2>
      <p className="section-description">
        This uses a lip bezel, which makes the surface convex on the outside and
        concave in the middle. This makes the center slider zoomed out, while the
        edges refract the inside.
      </p>
      <div className={`demo-container demo-touch-none${useImage ? " demo-image-bg" : ""}`}>
        <div {...bind()} className="switch-track" style={{ backgroundColor: trackColor }}>
          <refractive.div
            className={`switch-thumb${pressed ? " switch-thumb-pressed" : ""}`}
            style={{
              transform: `translateX(${displayX}px) translateY(-50%) scale(${scale})`,
              backgroundColor: bg,
            }}
            refraction={{
              radius: 46, blur: params.blurLevel, bezelWidth: 18,
              glassThickness: params.refractionLevel * 70, refractiveIndex: 1.5,
              specularOpacity: params.specularOpacity, bezelHeightFn: lip,
            }}
          />
        </div>
        <label className="demo-checkbox">
          <input type="checkbox" checked={useImage} onChange={e => setUseImage(e.target.checked)} />
          Use background image
        </label>
      </div>
      <Params params={params} />
    </div>
  );
}

/* ═══════════════════════ SLIDER ═══════════════════════ */

function SliderDemo() {
  const [value, setValue] = useState(10);
  const [pressed, setPressed] = useState(false);
  const [useImage, setUseImage] = useState(false);
  const [motionMode, setMotionMode] = useState<"smooth" | "instant">("smooth");
  const params = useRefractionParams({ specular: 0.4, refraction: 1.0, blur: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trackWidth = 330;

  const pctFromClient = useCallback((clientX: number) => {
    const el = wrapperRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * 100;
  }, [value]);

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
      const display = pct < 0 ? -(rubberBand(-pct, 8) / 100) * 100
        : pct > 100 ? 100 + (rubberBand(pct - 100, 8) / 100) * 100
        : pct;
      setRawPct(display);
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
  const scale = pressed ? 0.9 : 0.6;
  const bg = pressed ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,1)";

  const smooth = "transform 0.15s ease-out, left 0.35s cubic-bezier(0.4,0,0.2,1), background-color 0.1s ease, box-shadow 0.15s ease";
  const instant = "transform 0.08s ease-out, left 0s, background-color 0.1s ease, box-shadow 0.1s ease";
  const rest = "transform 0.2s ease, left 0.35s cubic-bezier(0.4,0,0.2,1), background-color 0.25s ease, box-shadow 0.25s ease";
  const thumbTransition = pressed ? (motionMode === "instant" ? instant : smooth) : rest;
  const fillTransition = motionMode === "instant" ? "width 0s" : "width 0.35s cubic-bezier(0.4,0,0.2,1)";

  return (
    <div className="component-section">
      <h2 className="section-heading">Slider</h2>
      <p className="section-description">
        Slider allows you to see the current level through the glass, while the
        sides refract the background. It uses a convex bezel.
      </p>
      <div className={`demo-container${useImage ? " demo-image-bg" : ""}`}>
        <div {...bind()} className="slider-wrapper" ref={wrapperRef}>
          <div className="slider-track">
            <div className="slider-track-inner">
              <div className="slider-fill" style={{ width: `${value}%`, transition: fillTransition }} />
            </div>
          </div>
          <refractive.div
            className={`slider-thumb${pressed ? " slider-thumb-active" : ""}`}
            style={{ left: `${thumbLeft}px`, transform: `scale(${scale})`, backgroundColor: bg, transition: thumbTransition }}
            refraction={{
              radius: 30, blur: params.blurLevel, bezelWidth: 14,
              glassThickness: params.refractionLevel * 70, refractiveIndex: 1.5,
              specularOpacity: params.specularOpacity, bezelHeightFn: convex,
            }}
          />
        </div>
        <label className="demo-checkbox">
          <input type="checkbox" checked={useImage} onChange={e => setUseImage(e.target.checked)} />
          Use background image
        </label>
      </div>
      <Params params={params} />
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
