import { useState } from "react";

export const PARAM_CONFIG = [
  { key: "specular", label: "Specular Opacity", min: 0, max: 1, step: 0.01 },
  { key: "refraction", label: "Refraction Level", min: 0, max: 1, step: 0.01 },
  { key: "blur", label: "Blur Level", min: 0, max: 40, step: 0.1 },
] as const;

export type ParamKey = (typeof PARAM_CONFIG)[number]["key"];
export type ParamValues = Record<ParamKey, number>;

export function useRefractionParams(defaults: ParamValues) {
  const [params, setParams] = useState(defaults);
  const set = (key: ParamKey) => (v: number) => setParams(p => ({ ...p, [key]: v }));
  return { params, set };
}

export function buildRefraction(p: ParamValues, extra: { radius: number; bezelWidth: number; bezelHeightFn: (x: number) => number }) {
  return {
    blur: p.blur, glassThickness: p.refraction * 70, refractiveIndex: 1.5,
    specularOpacity: p.specular, ...extra,
  };
}
