import { useState } from "react";
import { useDrag } from "@use-gesture/react";
import { rubberBandClamp, opaqueOn, TRACK_ON, TRACK_OFF, TRACK_RGBA, TR_SWITCH, TR_SWITCH_PRESS } from "../utils";

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

  const trackColor = (() => {
    if (!pressed) return active ? TRACK_ON : TRACK_OFF;
    const [r, g, b, a] = TRACK_RGBA.off.map((v, i) => v + (TRACK_RGBA.on[i] - v) * ratio);
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
