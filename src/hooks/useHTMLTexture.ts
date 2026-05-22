import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
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
  const currentCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastSizeRef = useRef({ w: 0, h: 0 });

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  useFrame(() => {
    if (!enabled) return;
    const el = elementRef.current;
    if (!el || pendingRef.current) return;

    pendingRef.current = true;
    const renderer = getHtmlRenderer();
    renderer
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
      })
      .catch(() => {
        /* ignore rasterization errors */
      })
      .finally(() => {
        pendingRef.current = false;
      });
  });

  return texture;
}
