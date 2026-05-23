function rubberBand(overshoot: number, limit: number) {
  return limit * (1 - Math.exp(-overshoot / limit))
}

export function rubberBandClamp(val: number, min: number, max: number, limit: number) {
  if (val < min) return min - rubberBand(min - val, limit)
  if (val > max) return max + rubberBand(val - max, limit)
  return val
}

const HEX_RE = /^#([0-9a-f]{6})$/i
const RGB_RE = /^rgba?\(([^)]+)\)$/
const DEFAULT_BG: readonly [number, number, number] = [26, 26, 26]

function parseColorToRGB(str: string): [number, number, number] {
  const s = str.trim()
  const hex = HEX_RE.exec(s)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const rgb = RGB_RE.exec(s)
  if (rgb) {
    const p = rgb[1].split(',').map(x => parseFloat(x.trim()))
    return [Math.round(p[0] ?? 0), Math.round(p[1] ?? 0), Math.round(p[2] ?? 0)]
  }
  return [DEFAULT_BG[0], DEFAULT_BG[1], DEFAULT_BG[2]]
}

/**
 * Reads the page background color from a CSS variable (--bg2 by default)
 * resolved against `el` so the value follows the active theme.
 */
export function readPageBg(el: HTMLElement | null, varName = '--bg2'): [number, number, number] {
  if (!el) return [DEFAULT_BG[0], DEFAULT_BG[1], DEFAULT_BG[2]]
  const raw = getComputedStyle(el).getPropertyValue(varName)
  return parseColorToRGB(raw)
}

export function opaqueOn(
  r: number,
  g: number,
  b: number,
  a: number,
  bg: readonly [number, number, number] = DEFAULT_BG
) {
  const [br, bgr, bb] = bg
  return `rgb(${Math.round(br + (r - br) * a)},${Math.round(bgr + (g - bgr) * a)},${Math.round(bb + (b - bb) * a)})`
}

export const TRACK_RGBA = { off: [140, 140, 148, 0.5], on: [59, 191, 78, 0.93] }

/* ─── Transitions ─── */

export const TR_SWITCH =
  'translate 0.35s cubic-bezier(0.4,0,0.2,1), scale 0.25s ease, background-color 0.25s ease, box-shadow 0.25s ease'
export const TR_SWITCH_PRESS =
  'translate 0s, scale 0.08s ease-out, background-color 0.2s ease, box-shadow 0.2s ease'
export const TR_SLIDER =
  'transform 0.2s ease, left 0.35s cubic-bezier(0.4,0,0.2,1), background-color 0.25s ease, box-shadow 0.25s ease'
export const TR_SLIDER_SMOOTH =
  'transform 0.15s ease-out, left 0.35s cubic-bezier(0.4,0,0.2,1), background-color 0.1s ease, box-shadow 0.15s ease'
export const TR_SLIDER_DRAG =
  'transform 0.08s ease-out, left 0s, background-color 0.1s ease, box-shadow 0.1s ease'
