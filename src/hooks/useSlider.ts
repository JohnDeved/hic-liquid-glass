import { useState, useEffect, useRef } from "react";
import { useDrag } from "@use-gesture/react";
import { rubberBandClamp, TR_SLIDER, TR_SLIDER_SMOOTH, TR_SLIDER_DRAG } from "../utils";

const TRACK_WIDTH = 330;

export function useSlider() {
  const [value, setValue] = useState(10);
  const [pressed, setPressed] = useState(false);
  const [motionMode, setMotionMode] = useState<"smooth" | "instant">("smooth");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [rawPct, setRawPct] = useState(10);

  const pctFromClient = (clientX: number) => {
    const rect = wrapperRef.current!.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * 100;
  };

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

  const dragging = motionMode === "instant";
  const thumbLeft = (pressed ? rawPct : value) / 100 * TRACK_WIDTH;
  const thumbTransition = pressed
    ? (dragging ? TR_SLIDER_DRAG : TR_SLIDER_SMOOTH)
    : TR_SLIDER;
  const thumbScale = pressed ? 0.9 : 0.6;
  const thumbBg = pressed ? "rgba(255,255,255,0.12)" : "#fff";
  const thumbShadow = pressed ? "0 5px 24px rgba(0,0,0,0.16)" : "0 3px 14px rgba(0,0,0,0.1)";

  // Animate the fill width in JS rather than via a CSS transition: the HIC
  // polyfill clones the DOM each frame without transition history, so a
  // CSS-driven width snaps to its final value inside the glass texture
  // while the surrounding live DOM still interpolates. JS-animating keeps
  // the inline style itself in sync, so texture and DOM agree.
  const targetFill = pressed ? rawPct : value;
  const [fillPct, setFillPct] = useState(targetFill);
  const fromRef = useRef(targetFill);
  const rafRef = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (dragging) {
      // Track the live drag position so the post-release animation
      // starts from the right place. Sync fillPct as well so the
      // rendered width stays current.
      fromRef.current = targetFill;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFillPct(targetFill);
      return;
    }
    const from = fromRef.current;
    const to = targetFill;
    if (from === to) return;
    const t0 = performance.now();
    const dur = 350;
    const ease = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const tick = () => {
      const t = Math.min(1, (performance.now() - t0) / dur);
      const v = from + (to - from) * ease(t);
      fromRef.current = v;
      setFillPct(v);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [targetFill, dragging]);

  return {
    bind, wrapperRef, value, pressed, dragging,
    thumbLeft, thumbTransition, thumbScale, thumbBg, thumbShadow,
    fillPct, trackWidth: TRACK_WIDTH,
  };
}
