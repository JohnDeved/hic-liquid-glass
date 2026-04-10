import { useState, useRef } from "react";
import { useDrag } from "@use-gesture/react";
import { rubberBandClamp, TR_SLIDER, TR_SLIDER_SMOOTH, TR_SLIDER_DRAG, TR_FILL } from "../utils";

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
  const fillTransition = dragging ? "width 0s" : TR_FILL;

  return {
    bind, wrapperRef, value, pressed, dragging,
    thumbLeft, thumbTransition, thumbScale, thumbBg, thumbShadow,
    fillTransition, trackWidth: TRACK_WIDTH,
  };
}
