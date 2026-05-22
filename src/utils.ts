function rubberBand(overshoot: number, limit: number) {
  return limit * (1 - Math.exp(-overshoot / limit));
}

export function rubberBandClamp(val: number, min: number, max: number, limit: number) {
  if (val < min) return min - rubberBand(min - val, limit);
  if (val > max) return max + rubberBand(val - max, limit);
  return val;
}

const BG = 26;
export function opaqueOn(r: number, g: number, b: number, a: number) {
  return `rgb(${Math.round(BG + (r - BG) * a)},${Math.round(BG + (g - BG) * a)},${Math.round(BG + (b - BG) * a)})`;
}

export const TRACK_RGBA = { off: [140, 140, 148, 0.5], on: [59, 191, 78, 0.93] };

/* ─── Transitions ─── */

export const TR_SWITCH = "transform 0.35s cubic-bezier(0.4,0,0.2,1), background-color 0.25s ease, box-shadow 0.25s ease";
export const TR_SWITCH_PRESS = "transform 0.08s ease-out, background-color 0.2s ease, box-shadow 0.2s ease";
export const TR_SLIDER = "transform 0.2s ease, left 0.35s cubic-bezier(0.4,0,0.2,1), background-color 0.25s ease, box-shadow 0.25s ease";
export const TR_SLIDER_SMOOTH = "transform 0.15s ease-out, left 0.35s cubic-bezier(0.4,0,0.2,1), background-color 0.1s ease, box-shadow 0.15s ease";
export const TR_SLIDER_DRAG = "transform 0.08s ease-out, left 0s, background-color 0.1s ease, box-shadow 0.1s ease";
