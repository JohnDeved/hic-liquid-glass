/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { lip } from "@hashintel/refractive";
import * as THREE from "three";
import { useHTMLTexture } from "../hooks/useHTMLTexture";
import { GlassThumb } from "./GlassThumb";

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

interface Registration {
  id: number;
  el: HTMLElement;
  refraction: GlassRefractionParams;
}

interface RegistryApi {
  register: (el: HTMLElement, refraction: GlassRefractionParams) => number;
  unregister: (id: number) => void;
  update: (id: number, refraction: GlassRefractionParams) => void;
}

const RegistryContext = createContext<RegistryApi | null>(null);

export function useGlassRegistry(): RegistryApi | null {
  return useContext(RegistryContext);
}

interface WebGLGlassOverlayProps {
  /** Ref to the bg-styled stage div — the HIC rasterization source. */
  stageRef: RefObject<HTMLElement | null>;
  /** Children include the stage (with GlassRect placeholders) so they share the
   * registry context with the overlay. */
  children: ReactNode;
}

/**
 * Provides a registry of `<GlassRect>` placeholders and overlays a single
 * `<Canvas>` (sibling of the stage) that renders one `<GlassThumb>` per
 * registered placeholder. The thumbs use a shared HTMLTexture of the stage
 * as their refraction source.
 */
export function WebGLGlassOverlay({ stageRef, children }: WebGLGlassOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const nextIdRef = useRef(1);
  const [registrations, setRegistrations] = useState<Map<number, Registration>>(
    () => new Map(),
  );

  const register = useCallback(
    (el: HTMLElement, refraction: GlassRefractionParams) => {
      const id = nextIdRef.current++;
      setRegistrations((prev) => {
        const next = new Map(prev);
        next.set(id, { id, el, refraction });
        return next;
      });
      return id;
    },
    [],
  );

  const unregister = useCallback((id: number) => {
    setRegistrations((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const update = useCallback((id: number, refraction: GlassRefractionParams) => {
    setRegistrations((prev) => {
      const existing = prev.get(id);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(id, { ...existing, refraction });
      return next;
    });
  }, []);

  const api = useMemo<RegistryApi>(
    () => ({ register, unregister, update }),
    [register, unregister, update],
  );

  const items = useMemo(() => Array.from(registrations.values()), [registrations]);

  return (
    <RegistryContext.Provider value={api}>
      {children}
      <div
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 1 }}
      >
        <div className="absolute inset-0 pointer-events-none">
          {items.map((r) => (
            <ShadowProxy key={r.id} el={r.el} radius={r.refraction.radius} />
          ))}
        </div>
        <Canvas
          flat
          orthographic
          camera={{ zoom: 1, position: [0, 0, 100], near: 0.1, far: 200 }}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          dpr={window.devicePixelRatio}
          gl={{ alpha: true, premultipliedAlpha: false }}
        >
          <GlassScene stageRef={stageRef} overlayRef={overlayRef} items={items} />
        </Canvas>
      </div>
    </RegistryContext.Provider>
  );
}

/**
 * Mirrors a placeholder's screen geometry and box-shadow into a DOM element
 * that lives OUTSIDE the HIC capture subtree, so the thumb's drop shadow
 * renders on top of the stage just like the refractive backend does, but
 * without polluting the refraction texture.
 */
function ShadowProxy({ el, radius }: { el: HTMLElement; radius: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const div = ref.current;
      const parent = div?.parentElement;
      if (div && parent) {
        const r = el.getBoundingClientRect();
        const pr = parent.getBoundingClientRect();
        const cs = getComputedStyle(el);
        div.style.transform = `translate(${r.left - pr.left}px, ${r.top - pr.top}px)`;
        div.style.width = `${r.width}px`;
        div.style.height = `${r.height}px`;
        div.style.boxShadow = cs.boxShadow;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [el]);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        backgroundColor: "transparent",
        borderRadius: `${radius}px`,
        pointerEvents: "none",
        willChange: "transform",
      }}
    />
  );
}

interface GlassSceneProps {
  stageRef: RefObject<HTMLElement | null>;
  overlayRef: RefObject<HTMLDivElement | null>;
  items: Registration[];
}

function GlassScene({ stageRef, overlayRef, items }: GlassSceneProps) {
  const sceneTex = useHTMLTexture(stageRef);
  return (
    <>
      {items.map((r) => (
        <RegisteredGlass
          key={r.id}
          reg={r}
          overlayRef={overlayRef}
          sceneTex={sceneTex}
        />
      ))}
    </>
  );
}

interface RegisteredGlassProps {
  reg: Registration;
  overlayRef: RefObject<HTMLDivElement | null>;
  sceneTex: THREE.Texture;
}

/**
 * Wraps a single `<GlassThumb>` that tracks a placeholder DOM element by
 * measuring its layout + bounding rect each frame. The placeholder's
 * pre-transform layout size (offsetWidth/Height) gives us the glass size;
 * the post-transform bounding rect gives us position + scale.
 */
function RegisteredGlass({ reg, overlayRef, sceneTex }: RegisteredGlassProps) {
  const [size, setSize] = useState({ w: 1, h: 1 });
  const positionRef = useRef<[number, number, number]>([0, 0, 0]);
  const scaleRef = useRef<{ v: number }>({ v: 1 });
  const bgColorRef = useRef({ r: 1, g: 1, b: 1, a: 1 });

  useFrame(() => {
    const el = reg.el;
    const overlay = overlayRef.current;
    if (!el || !overlay) return;

    const layoutW = el.offsetWidth;
    const layoutH = el.offsetHeight;
    if (layoutW <= 0 || layoutH <= 0) return;

    const elRect = el.getBoundingClientRect();
    const ovRect = overlay.getBoundingClientRect();

    const centerX = elRect.left + elRect.width / 2 - ovRect.left;
    const centerY = elRect.top + elRect.height / 2 - ovRect.top;

    const pos = positionRef.current;
    pos[0] = centerX - ovRect.width / 2;
    pos[1] = ovRect.height / 2 - centerY;

    scaleRef.current.v = elRect.width / layoutW;

    // Read the placeholder's computed background color and feed it to the
    // shader as the bg-overlay color. The placeholder itself is opacity:0,
    // so this is the only way its bg-color reaches the rendered output.
    // Read the placeholder's computed background color and feed it to the
    // shader as the bg-overlay color. The placeholder itself is opacity:0,
    // so this is the only way its bg-color reaches the rendered output.
    parseCssColor(getComputedStyle(el).backgroundColor, bgColorRef.current);

    if (layoutW !== size.w || layoutH !== size.h) {
      setSize({ w: layoutW, h: layoutH });
    }
  });

  // bezelHeightFn reference → shader enum. Default to lip (0).
  const bezelType = reg.refraction.bezelHeightFn === lip ? 0 : 1;

  // eslint-disable-next-line react-hooks/refs
  const position = positionRef.current;
  // eslint-disable-next-line react-hooks/refs
  const scaleCarrier = scaleRef.current;
  // eslint-disable-next-line react-hooks/refs
  const bgCarrier = bgColorRef.current;

  return (
    <GlassThumb
      position={position}
      width={size.w}
      height={size.h}
      radius={reg.refraction.radius}
      bezelWidth={reg.refraction.bezelWidth}
      glassThickness={reg.refraction.glassThickness}
      ior={reg.refraction.refractiveIndex}
      blur={reg.refraction.blur}
      specularOpacity={reg.refraction.specularOpacity}
      bezelType={bezelType}
      scaleRef={scaleCarrier}
      bgColorRef={bgCarrier}
      sceneTex={sceneTex}
    />
  );
}

/**
 * Parses CSS color strings ("rgb(...)", "rgba(...)", "#hex", "transparent")
 * into normalized 0-1 RGBA. Writes into the provided target to avoid alloc.
 * Falls back to opaque white on parse failure.
 */
function parseCssColor(
  s: string,
  out: { r: number; g: number; b: number; a: number },
) {
  if (!s || s === "transparent") {
    out.r = 0; out.g = 0; out.b = 0; out.a = 0;
    return;
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(",").map((x) => parseFloat(x.trim()));
    out.r = (p[0] ?? 255) / 255;
    out.g = (p[1] ?? 255) / 255;
    out.b = (p[2] ?? 255) / 255;
    out.a = p[3] ?? 1;
    return;
  }
  out.r = 1; out.g = 1; out.b = 1; out.a = 1;
}
