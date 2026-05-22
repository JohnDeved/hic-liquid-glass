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

    const markDirty = () => { dirtyRef.current = true; invalidate(); };

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

    let visibleAnims = 0;
    let placeholderAnims = 0;
    let loopRaf = 0;
    const loop = () => {
      // Visible transitions force a real raster; placeholder-only
      // transitions (press scale on the invisible GlassRect) just need
      // geometry to follow the scale, no re-raster needed.
      if (visibleAnims > 0) markDirty();
      else if (placeholderAnims > 0) geomOnly();
      const active = visibleAnims > 0 || placeholderAnims > 0;
      loopRaf = active ? requestAnimationFrame(loop) : 0;
    };
    const startLoop = () => { if (!loopRaf) loopRaf = requestAnimationFrame(loop); };
    const isPlaceholderEventTarget = (e: Event) =>
      e.target instanceof Element && e.target.closest("[data-glass-placeholder]");
    const onAnimStart = (e: Event) => {
      if (isPlaceholderEventTarget(e)) placeholderAnims++;
      else visibleAnims++;
      startLoop();
    };
    const onAnimEnd = (e: Event) => {
      if (isPlaceholderEventTarget(e)) placeholderAnims = Math.max(0, placeholderAnims - 1);
      else visibleAnims = Math.max(0, visibleAnims - 1);
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
      if (loopRaf) cancelAnimationFrame(loopRaf);
      el.removeEventListener("transitionrun", onAnimStart);
      el.removeEventListener("transitionend", onAnimEnd);
      el.removeEventListener("transitioncancel", onAnimEnd);
      el.removeEventListener("animationstart", onAnimStart);
      el.removeEventListener("animationend", onAnimEnd);
      el.removeEventListener("animationcancel", onAnimEnd);
    };
  }, [elementRef, invalidate, onRasterRef]);

  useFrame(() => {
    if (!enabled || !dirtyRef.current || pendingRef.current) return;
    const el = elementRef.current;
    if (!el) return;

    pendingRef.current = true;
    dirtyRef.current = false;
    // Snapshot DOM-side state synchronously with the start of the async
    // raster. The raster captures DOM at the moment update(el) reads the
    // subtree; subscribers (CanvasRectUpdater, RegisteredGlass) capture
    // their per-rect measurements at the same instant. When the raster
    // completes we commit those snapshots together with the new texture,
    // so the mesh, canvas wrap, and refracted content all advance as one
    // atomic step. This eliminates the 1-frame skew that otherwise made
    // the refracted background slide vs. the mesh during drag and "snap
    // back" when motion paused.
    onRasterRef?.current?.start();
    getHtmlRenderer()
      .update(el)
      .then((canvas) => {
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
        // On failure, keep the previous canvas but try again next frame.
        dirtyRef.current = true;
        invalidate();
      })
      .finally(() => {
        pendingRef.current = false;
      });
  });

  return texture;
}
