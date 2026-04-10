import { useState, useRef } from "react";
import { refractive, convex, lip } from "@hashintel/refractive";
import { useDrag } from "@use-gesture/react";
import clsx from "clsx";

/* ─── Utilities ─── */

function rubberBand(overshoot: number, limit: number) {
  return limit * (1 - Math.exp(-overshoot / limit));
}

function rubberBandClamp(val: number, min: number, max: number, limit: number) {
  if (val < min) return min - rubberBand(min - val, limit);
  if (val > max) return max + rubberBand(val - max, limit);
  return val;
}

const BG = 26;
function opaqueOn(r: number, g: number, b: number, a: number) {
  return `rgb(${Math.round(BG + (r - BG) * a)},${Math.round(BG + (g - BG) * a)},${Math.round(BG + (b - BG) * a)})`;
}

const TRACK_ON = opaqueOn(59, 191, 78, 0.93);
const TRACK_OFF = opaqueOn(140, 140, 148, 0.5);
const TRACK_RGBA = { off: [140, 140, 148, 0.5], on: [59, 191, 78, 0.93] };

/* ─── Transitions (too complex for Tailwind utilities) ─── */

const TR_SWITCH = "transform 0.35s cubic-bezier(0.4,0,0.2,1), background-color 0.25s ease, box-shadow 0.25s ease";
const TR_SWITCH_PRESS = "transform 0.08s ease-out, background-color 0.2s ease, box-shadow 0.2s ease";
const TR_SLIDER = "transform 0.2s ease, left 0.35s cubic-bezier(0.4,0,0.2,1), background-color 0.25s ease, box-shadow 0.25s ease";
const TR_SLIDER_SMOOTH = "transform 0.15s ease-out, left 0.35s cubic-bezier(0.4,0,0.2,1), background-color 0.1s ease, box-shadow 0.15s ease";
const TR_SLIDER_DRAG = "transform 0.08s ease-out, left 0s, background-color 0.1s ease, box-shadow 0.1s ease";
const TR_FILL = "width 0.35s cubic-bezier(0.4,0,0.2,1)";

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
    <div className="mt-6 flex flex-col gap-2.5 text-[var(--text-80)]">
      <div className="flex items-center gap-4">
        <div className="uppercase tracking-[0.14em] text-[10px] opacity-70 select-none whitespace-nowrap">
          Parameters
        </div>
        <div className="h-px flex-1 bg-[var(--ui-border)]" />
      </div>
      {PARAM_CONFIG.map(({ key, label, min, max, step }) => {
        const v = params[key];
        const display = step < 1 ? v.toFixed(2) : step < 10 ? v.toFixed(1) : String(v);
        return (
          <div key={key} className="flex items-center gap-4">
            <label className="w-56 uppercase tracking-[0.08em] text-[11px] opacity-80 select-none leading-tight shrink-0">
              {label}
            </label>
            <span className="w-14 text-right font-mono tabular-nums text-[11px] text-[var(--text-60)] shrink-0">
              {display}
            </span>
            <input
              type="range" min={min} max={max} step={step} value={v}
              onChange={e => set(key)(Number(e.target.value))}
              className="flex-1"
              aria-label={label}
            />
          </div>
        );
      })}
    </div>
  );
}

function refraction(p: ParamValues, extra: { radius: number; bezelWidth: number; bezelHeightFn: (x: number) => number }) {
  return {
    blur: p.blur, glassThickness: p.refraction * 70, refractiveIndex: 1.5,
    specularOpacity: p.specular, ...extra,
  };
}

/* ═══════════════════════ SWITCH ═══════════════════════ */

const DEMO = "demo-grid-bg h-96 rounded-xl border border-[var(--ui-border)] flex flex-col items-center justify-center relative overflow-hidden";
const CHECK = "absolute bottom-4 flex items-center gap-1.5 text-xs text-[var(--text-60)] cursor-pointer select-none";

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
    <div className="grid grid-rows-subgrid row-span-4">
      <h2 className="text-lg font-semibold mb-1.5">Switch</h2>
      <p className="text-[0.82rem] opacity-55 mb-3 leading-relaxed">
        This uses a lip bezel, which makes the surface convex on the outside and
        concave in the middle. This makes the center slider zoomed out, while the
        edges refract the inside.
      </p>
      <div className={clsx(DEMO, "touch-none", useImage && "demo-image-bg")}>
        <div
          {...bind()}
          className="w-[160px] h-[67px] rounded-[33.5px] relative cursor-pointer transition-colors duration-300 shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)]"
          style={{ backgroundColor: trackColor }}
        >
          <refractive.div
            className="absolute top-[33.5px] left-0 w-[146px] h-[92px] ml-[-21.95px] pointer-events-none"
            style={{
              transform: `translateX(${displayX}px) translateY(-50%) scale(${pressed ? 1.0 : 0.65})`,
              backgroundColor: pressed ? "rgba(255,255,255,0.15)" : "#fff",
              boxShadow: pressed ? "0 6px 30px rgba(0,0,0,0.18)" : "0 4px 22px rgba(0,0,0,0.1)",
              transition: pressed ? TR_SWITCH_PRESS : TR_SWITCH,
            }}
            refraction={refraction(params, { radius: 46, bezelWidth: 18, bezelHeightFn: lip })}
          />
        </div>
        <label className={CHECK}>
          <input type="checkbox" checked={useImage} onChange={e => setUseImage(e.target.checked)} className="accent-indigo-500" />
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
  const thumbTransition = pressed
    ? (dragging ? TR_SLIDER_DRAG : TR_SLIDER_SMOOTH)
    : TR_SLIDER;

  return (
    <div className="grid grid-rows-subgrid row-span-4">
      <h2 className="text-lg font-semibold mb-1.5">Slider</h2>
      <p className="text-[0.82rem] opacity-55 mb-3 leading-relaxed">
        Slider allows you to see the current level through the glass, while the
        sides refract the background. It uses a convex bezel.
      </p>
      <div className={clsx(DEMO, useImage && "demo-image-bg")}>
        <div {...bind()} className="relative w-[330px] h-[60px] cursor-pointer touch-none" ref={wrapperRef}>
          <div className="absolute left-0 top-[23px] w-[330px] h-[14px] pointer-events-none">
            <div className="w-full h-full bg-[rgb(90,90,93)] rounded-[7px] overflow-hidden shadow-[inset_0_1px_4px_rgba(0,0,0,0.4)]">
              <div
                className="h-full rounded-[6px] bg-[#0377f7] pointer-events-none"
                style={{ width: `${value}%`, transition: dragging ? "width 0s" : TR_FILL }}
              />
            </div>
          </div>
          <refractive.div
            className="absolute top-0 w-[90px] h-[60px] ml-[-45px] pointer-events-auto cursor-pointer"
            style={{
              left: `${thumbLeft}px`,
              transform: `scale(${pressed ? 0.9 : 0.6})`,
              backgroundColor: pressed ? "rgba(255,255,255,0.12)" : "#fff",
              boxShadow: pressed ? "0 5px 24px rgba(0,0,0,0.16)" : "0 3px 14px rgba(0,0,0,0.1)",
              transition: thumbTransition,
            }}
            refraction={refraction(params, { radius: 30, bezelWidth: 14, bezelHeightFn: convex })}
          />
        </div>
        <label className={CHECK}>
          <input type="checkbox" checked={useImage} onChange={e => setUseImage(e.target.checked)} className="accent-indigo-500" />
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
    <div className="dark min-h-screen bg-[var(--bg2)] text-[var(--c-text)] font-sans">
      <header className="text-center pt-12 px-6 pb-3">
        <h1 className="text-[2rem] font-bold mb-2">Liquid Glass Components</h1>
        <p className="text-sm opacity-60 mb-3">
          Recreating Apple's WWDC 2025 Liquid Glass effect — inspired by{" "}
          <a href="https://kube.io/blog/liquid-glass-css-svg" target="_blank" rel="noreferrer"
            className="text-inherit underline underline-offset-2">
            kube.io
          </a>
        </p>
      </header>
      <main className="grid grid-cols-2 gap-x-8 gap-y-4 max-w-[1400px] mx-auto px-6 pb-16 relative before:content-[''] before:absolute before:top-0 before:bottom-0 before:left-1/2 before:w-px before:bg-[var(--ui-border)]">
        <div className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] opacity-50 mb-6">
          Custom Implementation
        </div>
        <div className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] opacity-50 mb-6">
          Using{" "}
          <a href="https://github.com/hashintel/hash/tree/main/libs/%40hashintel/refractive" target="_blank" rel="noreferrer"
            className="text-inherit underline">
            @hashintel/refractive
          </a>
          {" "}<span className="inline-block text-[0.7rem] bg-yellow-500/15 border border-yellow-500/30 text-yellow-600 dark:text-amber-400 px-2.5 py-0.5 rounded-[5px] tracking-[0.02em] normal-case">Chrome only</span>
        </div>

        <div className="grid grid-rows-subgrid row-span-4">
          <h2 className="text-lg font-semibold mb-1.5">Switch</h2>
          <p className="text-[0.82rem] opacity-55 mb-3 leading-relaxed">Custom liquid glass switch (coming soon)</p>
          <div className={clsx(DEMO)} />
          <div />
        </div>
        <SwitchDemo />

        <div className="grid grid-rows-subgrid row-span-4">
          <h2 className="text-lg font-semibold mb-1.5">Slider</h2>
          <p className="text-[0.82rem] opacity-55 mb-3 leading-relaxed">Custom liquid glass slider (coming soon)</p>
          <div className={clsx(DEMO)} />
          <div />
        </div>
        <SliderDemo />
      </main>
      <footer className="text-center py-5 px-6 text-xs opacity-40 border-t border-[var(--ui-border)]">
        Johann Berger · 2025
      </footer>
    </div>
  );
}
