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
export function useHTMLTexture(
  elementRef: React.RefObject<HTMLElement | null>,
  enabled: boolean = true,
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
  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    const markDirty = () => { dirtyRef.current = true; invalidate(); };

    const subtreeObs = new MutationObserver(markDirty);
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

    return () => {
      subtreeObs.disconnect();
      rootObs.disconnect();
      resizeObs.disconnect();
      window.removeEventListener("resize", markDirty);
    };
  }, [elementRef, invalidate]);

  useFrame(() => {
    if (!enabled || !dirtyRef.current || pendingRef.current) return;
    const el = elementRef.current;
    if (!el) return;

    pendingRef.current = true;
    dirtyRef.current = false;
    getHtmlRenderer()
      .update(el)
      .then((canvas) => {
        const sizeChanged =
          canvas.width !== lastSizeRef.current.w ||
          canvas.height !== lastSizeRef.current.h;
        if (canvas !== currentCanvasRef.current || sizeChanged) {
          currentCanvasRef.current = canvas;
          lastSizeRef.current = { w: canvas.width, h: canvas.height };
          // Dispose the GL-side texture so three reallocates storage at
          // the new canvas dimensions on the next upload. Without this,
          // three reuses the old GL texture and falls back to a
          // subImage copy whose source overflows the destination,
          // producing GL_INVALID_VALUE warnings.
          texture.dispose();
          texture.image = canvas;
        }
        texture.needsUpdate = true;
        // The new texture must be drawn — schedule a render.
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
