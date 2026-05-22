import { type HTMLAttributes } from "react";
import { useGlassBackend } from "./GlassBackend";
import { refractive } from "@hashintel/refractive";
import { DisplacementGlass } from "./DisplacementGlass";

/**
 * Refraction parameters mirroring @hashintel/refractive's `refraction` prop.
 * `bezelHeightFn` reference is mapped to our shader's bezelType enum (0=lip,
 * 1=convex). Default unknown → 0.
 */
export interface GlassRefractionParams {
  radius: number;
  bezelWidth: number;
  glassThickness: number;
  refractiveIndex: number;
  specularOpacity: number;
  blur: number;
  bezelHeightFn?: (x: number) => number;
}

interface GlassRectProps extends HTMLAttributes<HTMLDivElement> {
  refraction: GlassRefractionParams;
}

/**
 * Backend-agnostic glass primitive. Mirrors the `refractive.div` API
 * (className, style, refraction). The actual rendering strategy is
 * picked from `GlassBackendContext`:
 *
 *  - "refractive": delegates to `<refractive.div>` (backdrop-filter, Chrome only).
 *  - "webgl":      renders a real visible <div> with all its CSS chrome
 *                  (bg-color, box-shadow, border-radius, transform) so
 *                  position/scale/color animate compositor-native, plus a
 *                  child <canvas> running a GLSL shader that samples an
 *                  HTML-in-Canvas texture of the surrounding stage
 *                  (via the three-html-render polyfill, on real DOM
 *                  mutations only).
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
    <DisplacementGlass
      className={className}
      style={style}
      refraction={refraction}
      {...rest}
    />
  );
}
