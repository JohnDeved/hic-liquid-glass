import { useEffect, useRef, type HTMLAttributes } from "react";
import { refractive } from "@hashintel/refractive";
import { useGlassBackend } from "./GlassBackend";
import { useGlassRegistry, type GlassRefractionParams } from "./WebGLGlassOverlay";

interface GlassRectProps extends HTMLAttributes<HTMLDivElement> {
  refraction: GlassRefractionParams;
}

/**
 * Backend-agnostic glass primitive. Mirrors the `refractive.div` API
 * (className, style, refraction). The actual rendering strategy is
 * picked from `GlassBackendContext`:
 *
 *  - "refractive": delegates to `<refractive.div>` (backdrop-filter, Chrome only)
 *  - "webgl":      renders a real DOM div in-place (same className/style as
 *                  the refractive version, so bg-color, shadow, transform
 *                  all behave identically) and registers with the
 *                  WebGLGlassOverlay. The overlay paints a GLSL glass
 *                  thumb sampling an HTML-in-Canvas texture of the stage
 *                  — which already includes this div's bg/shadow — so
 *                  refraction is of real HTML, no shader-side faking.
 */
export function GlassRect({ refraction, className, style, ...rest }: GlassRectProps) {
  const backend = useGlassBackend();

  if (backend === "refractive") {
    return (
      <refractive.div
        className={className}
        style={style}
        refraction={refraction}
        {...rest}
      />
    );
  }

  return (
    <WebGLGlassPlaceholder
      className={className}
      style={style}
      refraction={refraction}
      {...rest}
    />
  );
}

function WebGLGlassPlaceholder({
  refraction,
  className,
  style,
  ...rest
}: GlassRectProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const registry = useGlassRegistry();
  const idRef = useRef<number | null>(null);

  useEffect(() => {
    if (!registry || !elRef.current) return;
    const id = registry.register(elRef.current, refraction);
    idRef.current = id;
    return () => {
      registry.unregister(id);
      idRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry]);

  useEffect(() => {
    if (registry && idRef.current != null) {
      registry.update(idRef.current, refraction);
    }
  }, [registry, refraction]);

  // Make the placeholder invisible to both the user AND the HIC capture
  // (opacity:0 elements render no pixels into the foreignObject snapshot),
  // while keeping layout, hit-testing, and getComputedStyle intact. The
  // shader paints the visible glass and reads this element's bg-color via
  // a uniform, mirroring how CSS backdrop-filter composites bg-over-filter.
  const clippedStyle = { ...style, opacity: 0 };

  return <div ref={elRef} className={className} style={clippedStyle} {...rest} />;
}

