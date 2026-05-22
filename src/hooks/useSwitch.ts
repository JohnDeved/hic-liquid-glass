import { useState, useCallback, useRef, useEffect } from 'react'
import { useDrag } from '@use-gesture/react'
import {
  rubberBandClamp,
  opaqueOn,
  readPageBg,
  TRACK_RGBA,
  TR_SWITCH,
  TR_SWITCH_PRESS,
} from '../utils'
import { useAnimatedNumber } from './useAnimatedNumber'
import { useReleaseOnInterrupt } from './useReleaseOnInterrupt'

const MAX_X = 57.9

export function useSwitch() {
  const [active, setActive] = useState(true)
  const [pressed, setPressed] = useState(false)
  const [thumbX, setThumbX] = useState(0)
  const [bg, setBg] = useState<[number, number, number]>([26, 26, 26])
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Track the resolved page background so opaqueOn produces the right
  // solid track color in both light and dark themes. We re-read --bg2
  // whenever the root's class list changes (ThemeProvider toggles `dark`
  // on <html>).
  useEffect(() => {
    const update = () => setBg(readPageBg(wrapperRef.current))
    update()
    const obs = new MutationObserver(update)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  const bind = useDrag(
    ({ down, movement: [mx] }) => {
      setPressed(down)
      if (!down) {
        if (Math.abs(mx) < 5) {
          setActive(a => !a)
          return
        }
        const clamped = Math.max(0, Math.min(MAX_X, (active ? MAX_X : 0) + mx))
        setActive(clamped > MAX_X / 2)
        return
      }
      setThumbX(rubberBandClamp((active ? MAX_X : 0) + mx, 0, MAX_X, 40))
    },
    { pointer: { capture: true } }
  )

  const forceRelease = useCallback(() => {
    setPressed(false)
    setThumbX(0)
  }, [])
  useReleaseOnInterrupt(pressed, forceRelease, wrapperRef)

  const restingX = active ? MAX_X : 0
  const displayX = pressed ? thumbX : restingX
  const ratio = Math.max(0, Math.min(1, displayX / MAX_X))

  const restingRatio = active ? 1 : 0
  const targetRatio = pressed ? ratio : restingRatio
  const animRatio = useAnimatedNumber(targetRatio, { duration: 250, instant: pressed })

  const [r, g, b, a] = TRACK_RGBA.off.map((v, i) => v + (TRACK_RGBA.on[i] - v) * animRatio)
  const trackColor = opaqueOn(Math.round(r), Math.round(g), Math.round(b), a, bg)

  const thumbTransition = pressed ? TR_SWITCH_PRESS : TR_SWITCH
  const thumbScale = pressed ? 1 : 0.65
  const thumbBg = pressed ? 'rgba(255,255,255,0.15)' : '#fff'
  const thumbShadow = pressed ? '0 6px 30px rgba(0,0,0,0.18)' : '0 4px 22px rgba(0,0,0,0.1)'

  return {
    bind,
    wrapperRef,
    active,
    pressed,
    displayX,
    trackColor,
    thumbTransition,
    thumbScale,
    thumbBg,
    thumbShadow,
  }
}
