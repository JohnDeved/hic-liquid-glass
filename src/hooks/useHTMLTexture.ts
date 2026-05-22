import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getHtmlRenderer } from "three-html-render/polyfill";

/**
 * Wraps an HTMLElement as a live THREE.Texture using the HTML-in-Canvas
 * (WICG) API + three-html-render polyfill.
 *
 * The polyfill rasterizes the element into a regular HTMLCanvasElement
 * (using native `texElementImage2D` where available, SVG `foreignObject`
 * fallback otherwise). We wrap that canvas as a CanvasTexture and bump
 * `needsUpdate` whenever the source changes.
 *
 * Rasterization is the dominant per-frame cost (foreignObject paint is
 * not cheap), so we only re-rasterize when the element's subtree changes
 * (inline styles, classes, children, text) or when the theme class on
 * `<html>` toggles. Idle frames cost almost nothing.
 *
 * Returns a stable THREE.CanvasTexture; the consumer feeds it to a
 * shader uniform (sceneTex) where it is sampled in screen-space UVs.
 */
export interface RasterSubscription {
  snapshot: () => void;
  commit: () => void;
}

export function useHTMLTexture(
  elementRef: React.RefObject<HTMLElement | null>,
  enabled: boolean = true,
  onRasterRef?: React.RefObject<{
    start: () => void;
    commit: () => void;
  } | null>,
): THREE.Texture {
  const fallbackCanvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    return c;
  }, []);

  const texture = useMemo(() => {
    const tex = new THREE.CanvasTexture(fallbackCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }, [fallbackCanvas]);

  const pendingRef = useRef(false);
  const dirtyRef = useRef(true);
  const visibleAnimsRef = useRef(0);
  const placeholderAnimsRef = useRef(0);
  const currentCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastSizeRef = useRef({ w: 0, h: 0 });
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  // Mark dirty on any visual change inside the captured subtree, on
  // resize, and on theme class toggles (CSS-variable cascade is not
  // observable via MutationObserver inside the subtree). Also wakes
  // the R3F frame loop (Canvas runs in `demand` mode for idle perf).
  //
  // CSS transitions/animations interpolate computed style without firing
  // mutations, so we additionally run a continuous dirty+invalidate loop
  // while any transition/animation is in flight inside the subtree.
  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    const markDirty = () => {
      dirtyRef.current = true;
      invalidate();
      // Start the async raster immediately from the mutation microtask
      // rather than waiting for the next useFrame. Shaves one rAF
      // (~8-16ms) off click-to-first-rendered-frame latency. No-op if
      // a raster is already in flight; the in-flight raster's
      // .finally() will chain the next one.
      kickRasterRef.current();
    };

    // A placeholder-only DOM change (the invisible GlassRect placeholder
    // moving / scaling during drag) doesn't affect rasterized pixels, so
    // we skip the expensive async raster. But subscribers still need to
    // advance their geometry (canvas wrap position, mesh position) so
    // the WebGL output follows the thumb. Fire a synchronous
    // snapshot+commit pass for those — same shape as the raster
    // lifecycle, just no texture upload.
    const geomOnly = () => {
      onRasterRef?.current?.start();
      onRasterRef?.current?.commit();
      invalidate();
    };

    const isPlaceholderTarget = (n: Node): boolean => {
      const el = n.nodeType === 1 ? (n as Element) : n.parentElement;
      return !!el?.closest("[data-glass-placeholder]");
    };
    const subtreeCallback = (records: MutationRecord[]) => {
      let visibleChange = false;
      for (const r of records) {
        if (!isPlaceholderTarget(r.target)) { visibleChange = true; break; }
      }
      if (visibleChange) markDirty();
      else geomOnly();
    };

    const subtreeObs = new MutationObserver(subtreeCallback);
    subtreeObs.observe(el, {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true,
    });

    const rootObs = new MutationObserver(markDirty);
    rootObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    const resizeObs = new ResizeObserver(markDirty);
    resizeObs.observe(el);

    window.addEventListener("resize", markDirty);

    // CSS transitions/animations interpolate computed style without
    // firing mutations, so transition events bump these counters and
    // useFrame drives the per-frame fan-out (and raster, for visible
    // transitions). Doing the fan-out at the TOP of useFrame — instead
    // of from a separate rAF loop — guarantees subscribers' refs are
    // fresh before R3F's render path reads them. The old separate loop
    // could fire after R3F's useFrame in a given frame, which left the
    // mesh painting last frame's measurements (visible as a small but
    // perceptible lag vs. the compositor-native refractive backend).
    const isPlaceholderEventTarget = (e: Event) =>
      e.target instanceof Element && e.target.closest("[data-glass-placeholder]");
    const onAnimStart = (e: Event) => {
      if (isPlaceholderEventTarget(e)) placeholderAnimsRef.current++;
      else visibleAnimsRef.current++;
      invalidate();
    };
    const onAnimEnd = (e: Event) => {
      if (isPlaceholderEventTarget(e)) {
        placeholderAnimsRef.current = Math.max(0, placeholderAnimsRef.current - 1);
      } else {
        visibleAnimsRef.current = Math.max(0, visibleAnimsRef.current - 1);
      }
    };

    // Transition/animation events bubble, so a single listener at the
    // root of the captured subtree catches every descendant animation.
    el.addEventListener("transitionrun", onAnimStart);
    el.addEventListener("transitionend", onAnimEnd);
    el.addEventListener("transitioncancel", onAnimEnd);
    el.addEventListener("animationstart", onAnimStart);
    el.addEventListener("animationend", onAnimEnd);
    el.addEventListener("animationcancel", onAnimEnd);

    return () => {
      subtreeObs.disconnect();
      rootObs.disconnect();
      resizeObs.disconnect();
      window.removeEventListener("resize", markDirty);
      el.removeEventListener("transitionrun", onAnimStart);
      el.removeEventListener("transitionend", onAnimEnd);
      el.removeEventListener("transitioncancel", onAnimEnd);
      el.removeEventListener("animationstart", onAnimStart);
      el.removeEventListener("animationend", onAnimEnd);
      el.removeEventListener("animationcancel", onAnimEnd);
    };
  }, [elementRef, invalidate, onRasterRef]);

  // Kicks an async raster IFF one isn't already in flight. Defined
  // outside any effect so markDirty (which fires from MutationObserver
  // microtasks) can start the raster immediately, shaving one rAF
  // (~8-16ms on 60-120Hz) off the input-event → first-rendered-frame
  // latency vs. waiting for useFrame to start it.
  //
  // Stored in a ref so the inner function can re-arm itself from
  // .finally() if more mutations arrived during the in-flight raster.
  const kickRasterRef = useRef<() => void>(() => {});
  // Assigning .current at render-time keeps the closure's `enabled` /
  // `texture` / `invalidate` references fresh on every render without
  // needing to re-run an effect.
  // eslint-disable-next-line react-hooks/immutability
  kickRasterRef.current = () => {
    if (!enabled || pendingRef.current) return;
    const el = elementRef.current;
    if (!el || !dirtyRef.current) return;

    pendingRef.current = true;
    dirtyRef.current = false;
    // Snapshot DOM-side state synchronously with the start of the async
    // raster. The raster captures DOM at the moment update(el) reads
    // the subtree; subscribers (CanvasRectUpdater, RegisteredGlass)
    // capture their per-rect measurements at the same instant. When
    // the raster completes we commit those snapshots together with the
    // new texture so mesh, canvas wrap, and refracted content all
    // advance as one atomic step.
    onRasterRef?.current?.start();
    const __t0 = performance.now();
    getHtmlRenderer()
      .update(el)
      .then((canvas) => {
        const __dt = performance.now() - __t0;
        const w = window as unknown as { __rasterTimes?: number[] };
        if (!w.__rasterTimes) w.__rasterTimes = [];
        w.__rasterTimes.push(__dt);
        if (w.__rasterTimes.length > 500) w.__rasterTimes.shift();
        const sizeChanged =
          canvas.width !== lastSizeRef.current.w ||
          canvas.height !== lastSizeRef.current.h;
        if (canvas !== currentCanvasRef.current || sizeChanged) {
          currentCanvasRef.current = canvas;
          lastSizeRef.current = { w: canvas.width, h: canvas.height };
          texture.dispose();
          texture.image = canvas;
        }
        texture.needsUpdate = true;
        onRasterRef?.current?.commit();
        invalidate();
      })
      .catch(() => {
        // On failure, keep the previous canvas but try again.
        dirtyRef.current = true;
        invalidate();
      })
      .finally(() => {
        pendingRef.current = false;
        // Mutations that arrived during the in-flight raster set
        // dirtyRef; chain the next raster immediately so a Framer
        // Motion burst (e.g. switch toggle: 29 bg-color mutations in
        // ~256ms) sustains back-to-back rasters without waiting for
        // the next useFrame.
        if (dirtyRef.current) kickRasterRef.current();
      });
  };

  useFrame(() => {
    if (!enabled) return;

    // CSS transition driver. Visible transitions (e.g. switch bg-color
    // easing) need a fresh raster every frame; placeholder-only
    // transitions (the invisible GlassRect's press-scale / left / etc.)
    // only need geometry to follow. We do BOTH at the TOP of useFrame
    // so subscribers' refs (positionRef, targetRef, scaleRef, bgColorRef)
    // are updated BEFORE any other useFrame consumer reads them this
    // frame. This is the key to feeling as smooth as the compositor-
    // native refractive backend: the mesh and wrap transform always
    // reflect the current interpolated CSS state, not the previous frame's.
    const transitionActive =
      visibleAnimsRef.current > 0 || placeholderAnimsRef.current > 0;
    if (transitionActive) {
      onRasterRef?.current?.start();
      onRasterRef?.current?.commit();
      if (visibleAnimsRef.current > 0) dirtyRef.current = true;
      invalidate();
    }

    // markDirty kicks the raster immediately when a subtree mutation
    // fires, but ResizeObserver / window-resize / theme-class events
    // and the transition path above set dirty without going through
    // markDirty's kick path. Catch them here.
    if (dirtyRef.current && !pendingRef.current) {
      kickRasterRef.current();
    }
  });

  return texture;
}
