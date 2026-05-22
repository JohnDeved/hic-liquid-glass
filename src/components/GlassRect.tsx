import { type HTMLAttributes } from "react";
import { useGlassBackend } from "./GlassBackend";
import { refractive } from "@hashintel/refractive";
import { DisplacementGlass } from "./DisplacementGlass";

/** Refraction parameters mirroring @hashintel/refractive's `refraction` prop. */
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

/** Backend-agnostic glass primitive. Dispatches on `GlassBackendContext`:
 *  refractive → <refractive.div> (Chrome only), webgl → <DisplacementGlass>. */
export function GlassRect(props: GlassRectProps) {
  const Component = useGlassBackend() === "refractive" ? refractive.div : DisplacementGlass;
  return <Component {...props} />;
}
