import { useState, useEffect, useRef } from "react";
import { useDrag } from "@use-gesture/react";
import { rubberBandClamp, opaqueOn, TRACK_RGBA, TR_SWITCH, TR_SWITCH_PRESS } from "../utils";

const MAX_X = 57.9;

export function useSwitch() {
  const [active, setActive] = useState(true);
  const [pressed, setPressed] = useState(false);
  const [thumbX, setThumbX] = useState(0);

  const bind = useDrag(({ down, movement: [mx] }) => {
    setPressed(down);
    if (!down) {
      if (Math.abs(mx) < 5) { setActive(a => !a); return; }
      const clamped = Math.max(0, Math.min(MAX_X, (active ? MAX_X : 0) + mx));
      setActive(clamped > MAX_X / 2);
      return;
    }
    setThumbX(rubberBandClamp((active ? MAX_X : 0) + mx, 0, MAX_X, 40));
  }, { pointer: { capture: true } });

  const displayX = pressed ? thumbX : active ? MAX_X : 0;
  const ratio = Math.max(0, Math.min(1, displayX / MAX_X));

  // Drive the rail color via JS-animated ratio rather than a CSS transition.
  // The HIC polyfill rasterizes a clone of the DOM each frame and never
  // observes CSS transitions, so a CSS-driven rail color would snap to its
  // final value inside the glass texture while the surrounding real DOM
  // still interpolates. Animating the ratio in JS keeps the inline-style
  // value itself in sync, so both the texture and the live DOM agree.
  const targetRatio = pressed ? ratio : active ? 1 : 0;
  const [animRatio, setAnimRatio] = useState(targetRatio);
  const fromRef = useRef(targetRatio);
  const rafRef = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (pressed) {
      fromRef.current = targetRatio;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnimRatio(targetRatio);
      return;
    }
    const from = fromRef.current;
    const to = targetRatio;
    if (from === to) return;
    const t0 = performance.now();
    const dur = 250;
    const tick = () => {
      const t = Math.min(1, (performance.now() - t0) / dur);
      const eased = t * t * (3 - 2 * t);
      const v = from + (to - from) * eased;
      fromRef.current = v;
      setAnimRatio(v);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [targetRatio, pressed]);

  const trackColor = (() => {
    const [r, g, b, a] = TRACK_RGBA.off.map((v, i) => v + (TRACK_RGBA.on[i] - v) * animRatio);
    return opaqueOn(Math.round(r), Math.round(g), Math.round(b), a);
  })();

  const thumbTransition = pressed ? TR_SWITCH_PRESS : TR_SWITCH;
  const thumbScale = pressed ? 1.0 : 0.65;
  const thumbBg = pressed ? "rgba(255,255,255,0.15)" : "#fff";
  const thumbShadow = pressed ? "0 6px 30px rgba(0,0,0,0.18)" : "0 4px 22px rgba(0,0,0,0.1)";

  return {
    bind, active, pressed, displayX, trackColor,
    thumbTransition, thumbScale, thumbBg, thumbShadow,
  };
}
