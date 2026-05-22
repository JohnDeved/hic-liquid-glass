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
import { Canvas, useFrame, useThree } from "@react-three/fiber";
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
 * Bridge that lets DOM-side observers (ShadowProxy, useHTMLTexture)
 * wake the R3F frame loop while it's in `demand` mode. The Canvas
 * exposes its `invalidate` via this ref.
 */
type Invalidator = () => void;
const NOOP_INVALIDATOR: Invalidator = () => {};
const InvalidatorContext = createContext<{ current: Invalidator }>({ current: NOOP_INVALIDATOR });
export function useGlassInvalidator() { return useContext(InvalidatorContext); }

function InvalidatorBridge({ targetRef }: { targetRef: { current: Invalidator } }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    targetRef.current = invalidate;
    invalidate();
    return () => { targetRef.current = NOOP_INVALIDATOR; };
  }, [targetRef, invalidate]);
  return null;
}

/**
 * Provides a registry of `<GlassRect>` placeholders and overlays a single
 * `<Canvas>` (sibling of the stage) that renders one `<GlassThumb>` per
 * registered placeholder. The thumbs use a shared HTMLTexture of the stage
 * as their refraction source.
 */
export function WebGLGlassOverlay({ stageRef, children }: WebGLGlassOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const canvasRectRef = useRef({ x: 0, y: 0, w: 1, h: 1 });
  const invalidatorRef = useRef<Invalidator>(NOOP_INVALIDATOR);
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
      <InvalidatorContext.Provider value={invalidatorRef}>
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
          <CanvasRectTracker
            items={items}
            overlayRef={overlayRef}
            canvasWrapRef={canvasWrapRef}
            canvasRectRef={canvasRectRef}
          />
          <div
            ref={canvasWrapRef}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 1,
              height: 1,
              transform: "translate(0px, 0px)",
              pointerEvents: "none",
              willChange: "transform, width, height",
            }}
          >
            <Canvas
              flat
              orthographic
              camera={{ zoom: 1, position: [0, 0, 100], near: 0.1, far: 200 }}
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
              dpr={window.devicePixelRatio}
              gl={{ alpha: true, premultipliedAlpha: false }}
              frameloop="demand"
            >
              <InvalidatorBridge targetRef={invalidatorRef} />
              <GlassScene
                stageRef={stageRef}
                canvasRectRef={canvasRectRef}
                items={items}
              />
            </Canvas>
          </div>
        </div>
      </InvalidatorContext.Provider>
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
  const invalidator = useGlassInvalidator();

  useEffect(() => {
    const div = ref.current;
    const parent = div?.parentElement;
    if (!div || !parent) return;

    let raf = 0;
    let lastBoxShadow = "";

    const tick = () => {
      const r = el.getBoundingClientRect();
      const pr = parent.getBoundingClientRect();
      div.style.transform = `translate(${r.left - pr.left}px, ${r.top - pr.top}px)`;
      div.style.width = `${r.width}px`;
      div.style.height = `${r.height}px`;
      raf = 0;
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(tick);
      invalidator.current();
    };

    const syncBoxShadow = () => {
      const bs = getComputedStyle(el).boxShadow;
      if (bs !== lastBoxShadow) {
        lastBoxShadow = bs;
        div.style.boxShadow = bs;
      }
    };

    // CSS transitions/animations interpolate computed style purely in
    // the browser; no JS state changes, so we'd miss them in demand
    // mode. Run a continuous loop while at least one transition or
    // animation is in flight so the glass mesh tracks the placeholder
    // smoothly.
    let activeAnims = 0;
    let loopRaf = 0;
    const loop = () => {
      schedule();
      syncBoxShadow();
      loopRaf = activeAnims > 0 ? requestAnimationFrame(loop) : 0;
    };
    const startLoop = () => { if (!loopRaf) loopRaf = requestAnimationFrame(loop); };
    const onAnimStart = () => { activeAnims++; startLoop(); };
    const onAnimEnd = () => { activeAnims = Math.max(0, activeAnims - 1); };

    tick();
    syncBoxShadow();

    const elObs = new ResizeObserver(schedule);
    elObs.observe(el);
    const parentObs = new ResizeObserver(schedule);
    parentObs.observe(parent);

    const attrObs = new MutationObserver(() => {
      schedule();
      syncBoxShadow();
    });
    attrObs.observe(el, { attributes: true, attributeFilter: ["style", "class"] });

    el.addEventListener("transitionrun", onAnimStart);
    el.addEventListener("transitionend", onAnimEnd);
    el.addEventListener("transitioncancel", onAnimEnd);
    el.addEventListener("animationstart", onAnimStart);
    el.addEventListener("animationend", onAnimEnd);
    el.addEventListener("animationcancel", onAnimEnd);

    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (loopRaf) cancelAnimationFrame(loopRaf);
      elObs.disconnect();
      parentObs.disconnect();
      attrObs.disconnect();
      el.removeEventListener("transitionrun", onAnimStart);
      el.removeEventListener("transitionend", onAnimEnd);
      el.removeEventListener("transitioncancel", onAnimEnd);
      el.removeEventListener("animationstart", onAnimStart);
      el.removeEventListener("animationend", onAnimEnd);
      el.removeEventListener("animationcancel", onAnimEnd);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [el, invalidator]);

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

interface CanvasRectTrackerProps {
  items: Registration[];
  overlayRef: RefObject<HTMLDivElement | null>;
  canvasWrapRef: RefObject<HTMLDivElement | null>;
  canvasRectRef: RefObject<{ x: number; y: number; w: number; h: number }>;
}

/** Padding (CSS px) around the placeholder union rect, to absorb sub-pixel
 *  jitter and leave room for the bezel's outermost AA band. */
const CANVAS_PADDING = 16;

/**
 * Computes the tight bounding rect that the WebGL canvas needs to cover —
 * the union of all placeholder bounding rects plus a small padding — and
 * applies it to `canvasWrapRef` as inline width/height + transform. The
 * size is layout-based (offsetWidth/Height) so it stays stable during
 * drags; only the transform changes per frame as the placeholder moves.
 *
 * Runs the same event-driven update pattern as ShadowProxy (mutation,
 * resize, scroll, transition/animation events + a continuous loop while
 * any transition is in flight) and pokes `invalidator` so the R3F frame
 * loop wakes up to re-read the new rect.
 */
function CanvasRectTracker({
  items,
  overlayRef,
  canvasWrapRef,
  canvasRectRef,
}: CanvasRectTrackerProps) {
  const invalidator = useGlassInvalidator();

  useEffect(() => {
    const overlay = overlayRef.current;
    const wrap = canvasWrapRef.current;
    if (!overlay || !wrap || items.length === 0) return;

    let lastW = -1;
    let lastH = -1;
    let lastX = Number.NaN;
    let lastY = Number.NaN;

    const measure = () => {
      const ovRect = overlay.getBoundingClientRect();
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxLayoutW = 0;
      let maxLayoutH = 0;
      for (const r of items) {
        const el = r.el;
        const er = el.getBoundingClientRect();
        const cx = er.left + er.width / 2;
        const cy = er.top + er.height / 2;
        // Use layout size (not transformed bounding rect) so the canvas
        // doesn't bounce as the thumb scales — center around the bounding
        // box but size from the untransformed layout extent.
        const lw = el.offsetWidth || er.width;
        const lh = el.offsetHeight || er.height;
        maxLayoutW = Math.max(maxLayoutW, lw);
        maxLayoutH = Math.max(maxLayoutH, lh);
        minX = Math.min(minX, cx - lw / 2);
        minY = Math.min(minY, cy - lh / 2);
        maxX = Math.max(maxX, cx + lw / 2);
        maxY = Math.max(maxY, cy + lh / 2);
      }
      if (!isFinite(minX)) return;
      const x = minX - CANVAS_PADDING - ovRect.left;
      const y = minY - CANVAS_PADDING - ovRect.top;
      const w = Math.ceil(maxX - minX + CANVAS_PADDING * 2);
      const h = Math.ceil(maxY - minY + CANVAS_PADDING * 2);
      canvasRectRef.current.x = x;
      canvasRectRef.current.y = y;
      canvasRectRef.current.w = w;
      canvasRectRef.current.h = h;
      if (w !== lastW || h !== lastH) {
        wrap.style.width = `${w}px`;
        wrap.style.height = `${h}px`;
        lastW = w;
        lastH = h;
      }
      if (x !== lastX || y !== lastY) {
        wrap.style.transform = `translate(${x}px, ${y}px)`;
        lastX = x;
        lastY = y;
      }
      invalidator.current();
    };

    let raf = 0;
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; measure(); });
    };

    measure();

    const elObs = new ResizeObserver(schedule);
    const attrObs = new MutationObserver(schedule);
    for (const r of items) {
      elObs.observe(r.el);
      attrObs.observe(r.el, { attributes: true, attributeFilter: ["style", "class"] });
    }
    const ovObs = new ResizeObserver(schedule);
    ovObs.observe(overlay);

    let activeAnims = 0;
    let loopRaf = 0;
    const loop = () => {
      measure();
      loopRaf = activeAnims > 0 ? requestAnimationFrame(loop) : 0;
    };
    const startLoop = () => { if (!loopRaf) loopRaf = requestAnimationFrame(loop); };
    const onAnimStart = () => { activeAnims++; startLoop(); };
    const onAnimEnd = () => { activeAnims = Math.max(0, activeAnims - 1); };

    for (const r of items) {
      r.el.addEventListener("transitionrun", onAnimStart);
      r.el.addEventListener("transitionend", onAnimEnd);
      r.el.addEventListener("transitioncancel", onAnimEnd);
      r.el.addEventListener("animationstart", onAnimStart);
      r.el.addEventListener("animationend", onAnimEnd);
      r.el.addEventListener("animationcancel", onAnimEnd);
    }

    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (loopRaf) cancelAnimationFrame(loopRaf);
      elObs.disconnect();
      attrObs.disconnect();
      ovObs.disconnect();
      for (const r of items) {
        r.el.removeEventListener("transitionrun", onAnimStart);
        r.el.removeEventListener("transitionend", onAnimEnd);
        r.el.removeEventListener("transitioncancel", onAnimEnd);
        r.el.removeEventListener("animationstart", onAnimStart);
        r.el.removeEventListener("animationend", onAnimEnd);
        r.el.removeEventListener("animationcancel", onAnimEnd);
      }
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [items, overlayRef, canvasWrapRef, canvasRectRef, invalidator]);

  return null;
}

interface GlassSceneProps {
  stageRef: RefObject<HTMLElement | null>;
  canvasRectRef: RefObject<{ x: number; y: number; w: number; h: number }>;
  items: Registration[];
}

function GlassScene({ stageRef, canvasRectRef, items }: GlassSceneProps) {
  const sceneTex = useHTMLTexture(stageRef);
  return (
    <>
      {items.map((r) => (
        <RegisteredGlass
          key={r.id}
          reg={r}
          stageRef={stageRef}
          canvasRectRef={canvasRectRef}
          sceneTex={sceneTex}
        />
      ))}
    </>
  );
}

interface RegisteredGlassProps {
  reg: Registration;
  stageRef: RefObject<HTMLElement | null>;
  canvasRectRef: RefObject<{ x: number; y: number; w: number; h: number }>;
  sceneTex: THREE.Texture;
}

/**
 * Wraps a single `<GlassThumb>` that tracks a placeholder DOM element by
 * measuring its layout + bounding rect each frame. The placeholder's
 * pre-transform layout size (offsetWidth/Height) gives us the glass size;
 * the post-transform bounding rect gives us position + scale.
 */
function RegisteredGlass({ reg, stageRef, canvasRectRef, sceneTex }: RegisteredGlassProps) {
  const [size, setSize] = useState({ w: 1, h: 1 });
  const positionRef = useRef<[number, number, number]>([0, 0, 0]);
  const scaleRef = useRef<{ v: number }>({ v: 1 });
  const bgColorRef = useRef({ r: 1, g: 1, b: 1, a: 1 });
  const stageSizeRef = useRef({ x: 1, y: 1 });
  const canvasCenterRef = useRef({ x: 0, y: 0 });

  useFrame(() => {
    const el = reg.el;
    const stage = stageRef.current;
    const canvasRect = canvasRectRef.current;
    if (!el || !stage || !canvasRect) return;

    const layoutW = el.offsetWidth;
    const layoutH = el.offsetHeight;
    if (layoutW <= 0 || layoutH <= 0) return;

    const elRect = el.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();

    // Glass center in stage CSS px (TL origin, y-down).
    const glassCenterStageX = elRect.left + elRect.width / 2 - stageRect.left;
    const glassCenterStageY = elRect.top + elRect.height / 2 - stageRect.top;

    // Canvas center in stage CSS px = canvas TL within stage + canvas/2.
    // canvasRectRef.x/y are canvas TL within overlay; overlay is laid out
    // 1:1 with stage so we can use them directly as stage offsets.
    const canvasCenterStageX = canvasRect.x + canvasRect.w / 2;
    const canvasCenterStageY = canvasRect.y + canvasRect.h / 2;
    canvasCenterRef.current.x = canvasCenterStageX;
    canvasCenterRef.current.y = canvasCenterStageY;

    stageSizeRef.current.x = stageRect.width;
    stageSizeRef.current.y = stageRect.height;

    // Mesh position relative to canvas center, in world coords (y-up).
    const pos = positionRef.current;
    pos[0] = glassCenterStageX - canvasCenterStageX;
    pos[1] = canvasCenterStageY - glassCenterStageY;

    scaleRef.current.v = elRect.width / layoutW;

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
  // eslint-disable-next-line react-hooks/refs
  const stageSizeCarrier = stageSizeRef.current;
  // eslint-disable-next-line react-hooks/refs
  const canvasCenterCarrier = canvasCenterRef.current;

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
      stageSizeRef={stageSizeCarrier}
      canvasCenterRef={canvasCenterCarrier}
    />
  );
}

/**
 * Parses a `getComputedStyle().backgroundColor` value ("rgb(...)", "rgba(...)",
 * or "transparent") into normalized 0-1 RGBA. Writes into the provided target
 * to avoid alloc. Falls back to opaque white on parse failure.
 */
const RGBA_RE = /^rgba?\(([^)]+)\)$/;

function writeRGBA(
  out: { r: number; g: number; b: number; a: number },
  r: number, g: number, b: number, a: number,
) {
  out.r = r; out.g = g; out.b = b; out.a = a;
}

function parseCssColor(
  s: string,
  out: { r: number; g: number; b: number; a: number },
) {
  if (!s || s === "transparent") return writeRGBA(out, 0, 0, 0, 0);
  const m = s.match(RGBA_RE);
  if (!m) return writeRGBA(out, 1, 1, 1, 1);
  const p = m[1].split(",").map((x) => parseFloat(x.trim()));
  writeRGBA(out, (p[0] ?? 255) / 255, (p[1] ?? 255) / 255, (p[2] ?? 255) / 255, p[3] ?? 1);
}
