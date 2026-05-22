import { useEffect, useRef, useState } from "react";

type Easing = (t: number) => number;

const smoothstep: Easing = (t) => t * t * (3 - 2 * t);

/**
 * Smoothly animates a numeric value toward `target` via rAF. We drive the
 * inline-style value in JS (not CSS transitions) because the HIC polyfill
 * captures a clone of the DOM without transition state, so CSS-animated
 * properties snap to their final value inside the texture while the live
 * DOM still interpolates. When `instant` is true, snaps without animating
 * (useful while the user is dragging).
 */
export function useAnimatedNumber(
  target: number,
  options: { duration?: number; easing?: Easing; instant?: boolean } = {},
): number {
  const { duration = 300, easing = smoothstep, instant = false } = options;
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (instant) {
      fromRef.current = target;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(target);
      return;
    }
    const from = fromRef.current;
    const to = target;
    if (from === to) return;
    const t0 = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - t0) / duration);
      const v = from + (to - from) * easing(t);
      fromRef.current = v;
      setValue(v);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, instant, duration, easing]);

  return value;
}
