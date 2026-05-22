import { useEffect, useRef, useState } from "react";

type Easing = (t: number) => number;

const smoothstep: Easing = (t) => t * t * (3 - 2 * t);

/**
 * Smoothly animates a numeric value toward `target` via requestAnimationFrame.
 *
 * Why JS animation instead of CSS transitions? When a glass element refracts
 * the surrounding DOM via three-html-render (HIC + foreignObject polyfill),
 * the polyfill rasterizes a clone of the DOM each frame without transition
 * state, so CSS-animated properties snap to their final value inside the
 * texture while the live DOM still interpolates. Driving the inline-style
 * value itself keeps the texture and the live DOM in sync.
 *
 * When `instant` is true, the value snaps to `target` without animating
 * (useful while the user is actively driving the value, e.g. dragging).
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
