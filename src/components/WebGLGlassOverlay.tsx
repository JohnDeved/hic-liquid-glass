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
import { Canvas, useThree } from "@react-three/fiber";
import { lip } from "@hashintel/refractive";
import * as THREE from "three";
import { useHTMLTexture, type RasterSubscription } from "../hooks/useHTMLTexture";
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

  // Frame-lock plumbing: every DOM measurement that feeds the WebGL
  // output (canvas wrap rect + per-glass mesh position) registers a
  // {snapshot, commit} pair here. `useHTMLTexture` calls `start()`
  // synchronously before each async raster — that fans out to each
  // subscriber's snapshot, capturing live DOM at the raster's instant.
  // When the raster resolves, `commit()` fans out and each subscriber
  // copies its snapshot into its active carrier. The mesh, wrap, and
  // texture then advance together, eliminating drag-time skew.
  const rasterSubsRef = useRef<Set<RasterSubscription>>(new Set());
  const onRasterRef = useRef({
    start: () => { for (const s of rasterSubsRef.current) s.snapshot(); },
    commit: () => { for (const s of rasterSubsRef.current) s.commit(); },
  });

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
              <CanvasRectUpdater
                items={items}
                overlayRef={overlayRef}
                canvasWrapRef={canvasWrapRef}
                canvasRectRef={canvasRectRef}
                rasterSubsRef={rasterSubsRef}
              />
              <GlassScene
                stageRef={stageRef}
                canvasRectRef={canvasRectRef}
                items={items}
                onRasterRef={onRasterRef}
                rasterSubsRef={rasterSubsRef}
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

interface CanvasRectUpdaterProps {
  items: Registration[];
  overlayRef: RefObject<HTMLDivElement | null>;
  canvasWrapRef: RefObject<HTMLDivElement | null>;
  canvasRectRef: RefObject<{ x: number; y: number; w: number; h: number }>;
  rasterSubsRef: RefObject<Set<RasterSubscription>>;
}

/** Padding (CSS px) around the placeholder union rect, to absorb sub-pixel
 *  jitter and leave room for the bezel's outermost AA band. */
const CANVAS_PADDING = 16;

/**
 * Measures the placeholder union rect and applies it to the canvas wrap
 * (transform + size). Driven by the raster lifecycle (not useFrame) so
 * the wrap moves in lockstep with the texture: snapshot during raster
 * start, commit to DOM when the new texture arrives. The wrap therefore
 * never sits at a position that contradicts the texture, which used to
 * surface as drag-time skew between the mesh and the refracted content.
 */
function CanvasRectUpdater({
  items,
  overlayRef,
  canvasWrapRef,
  canvasRectRef,
  rasterSubsRef,
}: CanvasRectUpdaterProps) {
  const lastRef = useRef({ x: NaN, y: NaN, w: -1, h: -1 });
  const pendingRef = useRef({ x: 0, y: 0, w: 1, h: 1, valid: false });
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  useEffect(() => {
    const measure = () => {
      const overlay = overlayRef.current;
      const wrap = canvasWrapRef.current;
      const list = itemsRef.current;
      if (!overlay || !wrap || list.length === 0) return null;

      const ovRect = overlay.getBoundingClientRect();
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const r of list) {
        const el = r.el;
        const er = el.getBoundingClientRect();
        const cx = er.left + er.width / 2;
        const cy = er.top + er.height / 2;
        const lw = el.offsetWidth || er.width;
        const lh = el.offsetHeight || er.height;
        minX = Math.min(minX, cx - lw / 2);
        minY = Math.min(minY, cy - lh / 2);
        maxX = Math.max(maxX, cx + lw / 2);
        maxY = Math.max(maxY, cy + lh / 2);
      }
      if (!isFinite(minX)) return null;
      return {
        x: minX - CANVAS_PADDING - ovRect.left,
        y: minY - CANVAS_PADDING - ovRect.top,
        w: Math.ceil(maxX - minX + CANVAS_PADDING * 2),
        h: Math.ceil(maxY - minY + CANVAS_PADDING * 2),
      };
    };

    const sub: RasterSubscription = {
      snapshot: () => {
        const m = measure();
        if (!m) return;
        pendingRef.current.x = m.x;
        pendingRef.current.y = m.y;
        pendingRef.current.w = m.w;
        pendingRef.current.h = m.h;
        pendingRef.current.valid = true;
      },
      commit: () => {
        const p = pendingRef.current;
        const wrap = canvasWrapRef.current;
        if (!p.valid || !wrap) return;

        // Snap to integer pixels: the GPU compositor would otherwise
        // sub-pixel-filter the canvas backbuffer between frames. The
        // fractional remainder lives in the mesh position (computed in
        // RegisteredGlass relative to this integer canvas center), and
        // is rendered sub-pixel inside the backbuffer by the shader.
        const intX = Math.round(p.x);
        const intY = Math.round(p.y);

        canvasRectRef.current.x = intX;
        canvasRectRef.current.y = intY;
        canvasRectRef.current.w = p.w;
        canvasRectRef.current.h = p.h;

        const last = lastRef.current;
        if (p.w !== last.w || p.h !== last.h) {
          wrap.style.width = `${p.w}px`;
          wrap.style.height = `${p.h}px`;
          last.w = p.w;
          last.h = p.h;
        }
        if (intX !== last.x || intY !== last.y) {
          wrap.style.transform = `translate(${intX}px, ${intY}px)`;
          last.x = intX;
          last.y = intY;
        }
      },
    };

    // Initial snapshot + commit so the wrap has a valid position before
    // the first raster completes. Without this the canvas sits at its
    // default 1×1 / (0,0) for one frame after mount.
    sub.snapshot();
    sub.commit();

    rasterSubsRef.current.add(sub);
    const subs = rasterSubsRef.current;
    return () => { subs.delete(sub); };
  }, [overlayRef, canvasWrapRef, canvasRectRef, rasterSubsRef]);

  return null;
}

interface GlassSceneProps {
  stageRef: RefObject<HTMLElement | null>;
  canvasRectRef: RefObject<{ x: number; y: number; w: number; h: number }>;
  items: Registration[];
  onRasterRef: RefObject<{ start: () => void; commit: () => void } | null>;
  rasterSubsRef: RefObject<Set<RasterSubscription>>;
}

function GlassScene({ stageRef, canvasRectRef, items, onRasterRef, rasterSubsRef }: GlassSceneProps) {
  const sceneTex = useHTMLTexture(stageRef, true, onRasterRef);
  return (
    <>
      {items.map((r) => (
        <RegisteredGlass
          key={r.id}
          reg={r}
          stageRef={stageRef}
          canvasRectRef={canvasRectRef}
          sceneTex={sceneTex}
          rasterSubsRef={rasterSubsRef}
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
  rasterSubsRef: RefObject<Set<RasterSubscription>>;
}

/**
 * Wraps a single `<GlassThumb>` for a placeholder DOM element. Measurements
 * (position, scale, size, bg-color) are captured during the raster snapshot
 * phase and applied to the mesh carriers during commit, so the mesh always
 * matches the texture content frame-for-frame.
 */
function RegisteredGlass({ reg, stageRef, canvasRectRef, sceneTex, rasterSubsRef }: RegisteredGlassProps) {
  const [size, setSize] = useState({ w: 1, h: 1 });
  const positionRef = useRef<[number, number, number]>([0, 0, 0]);
  const scaleRef = useRef<{ v: number }>({ v: 1 });
  const bgColorRef = useRef({ r: 1, g: 1, b: 1, a: 1 });
  const stageSizeRef = useRef({ x: 1, y: 1 });
  const canvasCenterRef = useRef({ x: 0, y: 0 });

  const pendingRef = useRef({
    layoutW: 1,
    layoutH: 1,
    glassCenterStageX: 0,
    glassCenterStageY: 0,
    stageW: 1,
    stageH: 1,
    scale: 1,
    bg: { r: 1, g: 1, b: 1, a: 1 },
    valid: false,
  });

  useEffect(() => {
    const measure = () => {
      const el = reg.el;
      const stage = stageRef.current;
      if (!el || !stage) return null;
      const layoutW = el.offsetWidth;
      const layoutH = el.offsetHeight;
      if (layoutW <= 0 || layoutH <= 0) return null;
      const elRect = el.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const p = pendingRef.current;
      p.layoutW = layoutW;
      p.layoutH = layoutH;
      p.glassCenterStageX = elRect.left + elRect.width / 2 - stageRect.left;
      p.glassCenterStageY = elRect.top + elRect.height / 2 - stageRect.top;
      p.stageW = stageRect.width;
      p.stageH = stageRect.height;
      p.scale = elRect.width / layoutW;
      parseCssColor(getComputedStyle(el).backgroundColor, p.bg);
      p.valid = true;
      return p;
    };

    const sub: RasterSubscription = {
      snapshot: () => { measure(); },
      commit: () => {
        const p = pendingRef.current;
        const canvasRect = canvasRectRef.current;
        if (!p.valid || !canvasRect) return;

        const canvasCenterStageX = canvasRect.x + canvasRect.w / 2;
        const canvasCenterStageY = canvasRect.y + canvasRect.h / 2;
        canvasCenterRef.current.x = canvasCenterStageX;
        canvasCenterRef.current.y = canvasCenterStageY;

        stageSizeRef.current.x = p.stageW;
        stageSizeRef.current.y = p.stageH;

        const pos = positionRef.current;
        pos[0] = p.glassCenterStageX - canvasCenterStageX;
        pos[1] = canvasCenterStageY - p.glassCenterStageY;

        scaleRef.current.v = p.scale;

        bgColorRef.current.r = p.bg.r;
        bgColorRef.current.g = p.bg.g;
        bgColorRef.current.b = p.bg.b;
        bgColorRef.current.a = p.bg.a;

        if (p.layoutW !== size.w || p.layoutH !== size.h) {
          setSize({ w: p.layoutW, h: p.layoutH });
        }
      },
    };

    // Initial snapshot + commit so the mesh has valid position/size on
    // its first render.
    sub.snapshot();
    sub.commit();

    rasterSubsRef.current.add(sub);
    const subs = rasterSubsRef.current;
    return () => { subs.delete(sub); };
  }, [reg.el, stageRef, canvasRectRef, rasterSubsRef, size.w, size.h]);

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
