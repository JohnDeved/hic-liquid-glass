import { useState, useRef, useCallback } from "react";
import { useDrag } from "@use-gesture/react";
import { rubberBandClamp, TR_SLIDER, TR_SLIDER_SMOOTH, TR_SLIDER_DRAG } from "../utils";
import { useAnimatedNumber } from "./useAnimatedNumber";
import { useReleaseOnInterrupt } from "./useReleaseOnInterrupt";

const TRACK_WIDTH = 330;

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

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

  const clamp01 = (pct: number) => Math.max(0, Math.min(100, pct));

  const handleFirst = (x: number) => {
    if (releaseTimer.current) { clearTimeout(releaseTimer.current); releaseTimer.current = null; }
    setPressed(true);
    setMotionMode("smooth");
    const pct = clamp01(pctFromClient(x));
    setValue(Math.round(pct));
    setRawPct(pct);
  };

  const handleMove = (x: number) => {
    const pct = pctFromClient(x);
    setRawPct(rubberBandClamp(pct, 0, 100, 8));
    setValue(Math.round(clamp01(pct)));
  };

  const handleRelease = (x: number, moved: boolean) => {
    setMotionMode("smooth");
    setRawPct(clamp01(pctFromClient(x)));
    if (moved) {
      setPressed(false);
    } else {
      releaseTimer.current = setTimeout(() => { setPressed(false); releaseTimer.current = null; }, 400);
    }
  };

  const bind = useDrag(({ down, first, xy: [x], movement: [mx] }) => {
    const moved = Math.abs(mx) >= 5;
    if (first) handleFirst(x);
    else if (moved) setMotionMode("instant");
    if (down && !first) handleMove(x);
    if (!down) handleRelease(x, moved);
  }, { pointer: { capture: true } });

  const forceRelease = useCallback(() => {
    if (releaseTimer.current) { clearTimeout(releaseTimer.current); releaseTimer.current = null; }
    setPressed(false);
    setMotionMode("smooth");
    setRawPct((p) => Math.round(p));
  }, []);
  useReleaseOnInterrupt(pressed, forceRelease, wrapperRef);

  const dragging = motionMode === "instant";
  const thumbLeft = (pressed ? rawPct : value) / 100 * TRACK_WIDTH;
  const thumbTransition = pressed
    ? (dragging ? TR_SLIDER_DRAG : TR_SLIDER_SMOOTH)
    : TR_SLIDER;
  const thumbScale = pressed ? 0.9 : 0.6;
  const thumbBg = pressed ? "rgba(255,255,255,0.12)" : "#fff";
  const thumbShadow = pressed ? "0 5px 24px rgba(0,0,0,0.16)" : "0 3px 14px rgba(0,0,0,0.1)";

  const fillPct = useAnimatedNumber(pressed ? rawPct : value, {
    duration: 350,
    easing: easeInOutCubic,
    instant: dragging,
  });

  return {
    bind, wrapperRef, value, pressed, dragging,
    thumbLeft, thumbTransition, thumbScale, thumbBg, thumbShadow,
    fillPct, trackWidth: TRACK_WIDTH,
  };
}
