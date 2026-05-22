import { useEffect, useRef, type HTMLAttributes } from "react";
import { lip } from "@hashintel/refractive";
import { getHtmlRenderer } from "three-html-render/polyfill";
import type { GlassRefractionParams } from "./GlassRect";
import fragShader from "../shaders/glass.frag?raw";

/**
 * Option-D glass primitive.
 *
 * The thumb is a REAL visible <div> with all its CSS chrome (bg-color,
 * box-shadow, border-radius, transform) — so position, scale, color, and
 * shadow animate on the compositor thread, identical to <refractive.div>.
 *
 * Refraction is rendered by a child <canvas> (absolute inset-0, pointer-
 * events:none) that runs a tiny WebGL shader. The shader samples a
 * texture of the nearest `[data-glass-stage]` ancestor (raster'd via the
 * three-html-render polyfill, triggered only when the stage's DOM
 * actually mutates) and applies the bezel displacement.
 *
 * Per frame we only measure the host's bbox relative to the stage and
 * update UV uniforms — no JS-driven position/scale/color animation,
 * no per-frame raster, no overlay-canvas dance.
 */
interface Props extends HTMLAttributes<HTMLDivElement> {
  refraction: GlassRefractionParams;
}

export function DisplacementGlass({ refraction, className, style, ...rest }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const refractionRef = useRef(refraction);
  refractionRef.current = refraction;

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const stage = host.closest<HTMLElement>("[data-glass-stage]");
    if (!stage) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return;

    /* ── Shader program ──
       Inline vertex shader: the existing glass.vert relies on
       Three.js-injected matrices/attributes; here we draw a fullscreen
       quad directly in clip space so the bezel sampling math in
       glass.frag (which only uses vUv 0..1) works unchanged. */
    const vs = `
      attribute vec2 a_position;
      attribute vec2 a_uv;
      varying vec2 vUv;
      void main() {
        vUv = a_uv;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;
    const program = createProgram(gl, vs, fragShader);
    if (!program) return;
    gl.useProgram(program);

    const aPos = gl.getAttribLocation(program, "a_position");
    const aUv = gl.getAttribLocation(program, "a_uv");
    const u = {
      sceneTex: gl.getUniformLocation(program, "sceneTex"),
      resolution: gl.getUniformLocation(program, "resolution"),
      stageSize: gl.getUniformLocation(program, "stageSize"),
      canvasCenter: gl.getUniformLocation(program, "canvasCenter"),
      glassSize: gl.getUniformLocation(program, "glassSize"),
      thumbPos: gl.getUniformLocation(program, "thumbPos"),
      cornerRadius: gl.getUniformLocation(program, "cornerRadius"),
      bezelWidth: gl.getUniformLocation(program, "bezelWidth"),
      glassThickness: gl.getUniformLocation(program, "glassThickness"),
      ior: gl.getUniformLocation(program, "ior"),
      blurAmount: gl.getUniformLocation(program, "blurAmount"),
      specularOpacity: gl.getUniformLocation(program, "specularOpacity"),
      bezelType: gl.getUniformLocation(program, "bezelType"),
      bgColor: gl.getUniformLocation(program, "bgColor"),
    };

    /* Fullscreen quad covering the canvas (vUv 0..1). Matches GlassThumb. */
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      // x, y, u, v
      new Float32Array([
        -1, -1, 0, 0,
        1, -1, 1, 0,
        -1, 1, 0, 1,
        -1, 1, 0, 1,
        1, -1, 1, 0,
        1, 1, 1, 1,
      ]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);

    /* ── Texture ── */
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(u.sceneTex, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    /* ── State ── */
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let lastW = 0;
    let lastH = 0;
    let texSourceW = 0;
    let texSourceH = 0;
    let frameRaf = 0;
    let renderPending = false;
    const bg = { r: 1, g: 1, b: 1, a: 1 };

    const draw = () => {
      renderPending = false;
      const hostRect = host.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const w = hostRect.width;
      const h = hostRect.height;
      if (w <= 0 || h <= 0) return;

      // Resize canvas backing store on host size change. Use the LAYOUT
      // size (offsetWidth/Height) so the canvas matches the host in CSS
      // pixels regardless of the CSS scale transform.
      const layoutW = host.offsetWidth;
      const layoutH = host.offsetHeight;
      const bw = Math.max(1, Math.round(layoutW * dpr));
      const bh = Math.max(1, Math.round(layoutH * dpr));
      if (bw !== lastW || bh !== lastH) {
        canvas.width = bw;
        canvas.height = bh;
        lastW = bw;
        lastH = bh;
      }
      gl.viewport(0, 0, bw, bh);

      // Read bg-color live each frame (CSS transitions animate it on the
      // compositor; getComputedStyle returns the current interpolated
      // value, so the shader tracks it without any JS-side easing).
      parseCssColor(getComputedStyle(host).backgroundColor, bg);

      const r = refractionRef.current;
      const bezelType = r.bezelHeightFn === lip ? 0 : 1;
      const glassCenterStageX = hostRect.left + hostRect.width / 2 - stageRect.left;
      const glassCenterStageY = hostRect.top + hostRect.height / 2 - stageRect.top;

      // Canvas covers the host exactly, so canvasCenter == glassCenter.
      gl.uniform2f(u.resolution, layoutW, layoutH);
      gl.uniform2f(u.stageSize, stageRect.width, stageRect.height);
      gl.uniform2f(u.canvasCenter, glassCenterStageX, glassCenterStageY);
      gl.uniform2f(u.glassSize, layoutW, layoutH);
      gl.uniform2f(u.thumbPos, 0, 0);
      gl.uniform1f(u.cornerRadius, r.radius);
      gl.uniform1f(u.bezelWidth, r.bezelWidth);
      gl.uniform1f(u.glassThickness, r.glassThickness);
      gl.uniform1f(u.ior, r.refractiveIndex);
      gl.uniform1f(u.blurAmount, r.blur);
      gl.uniform1f(u.specularOpacity, r.specularOpacity);
      gl.uniform1i(u.bezelType, bezelType);
      gl.uniform4f(u.bgColor, bg.r, bg.g, bg.b, bg.a);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (texSourceW > 0 && texSourceH > 0) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    };

    const requestDraw = () => {
      if (renderPending) return;
      renderPending = true;
      frameRaf = requestAnimationFrame(draw);
    };

    /* ── Stage texture raster ── */
    let rasterPending = false;
    let rasterDirty = true;
    let disposed = false;
    const kickRaster = () => {
      if (disposed || rasterPending || !rasterDirty) return;
      rasterPending = true;
      rasterDirty = false;
      // Hide the host (incl. its canvas child) ONLY for the synchronous
      // clone the polyfill makes at the start of update(). The polyfill's
      // buildSvg → de() does cloneNode(true) synchronously before its
      // first await, so by the time update() returns its promise the
      // clone is already snapshotted. We restore visibility right after
      // in the same JS task, so the browser never paints a hidden frame —
      // no flash — but the captured texture omits our own pixels (which
      // would otherwise feed back into the bezel refraction and let the
      // user see the thumb refracting itself).
      host.style.visibility = "hidden";
      const p = getHtmlRenderer().update(stage);
      host.style.visibility = "";
      p
        .then((srcCanvas) => {
          if (disposed) return;
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            srcCanvas,
          );
          texSourceW = srcCanvas.width;
          texSourceH = srcCanvas.height;
          requestDraw();
        })
        .catch(() => { if (!disposed) rasterDirty = true; })
        .finally(() => {
          if (disposed) return;
          rasterPending = false;
          if (rasterDirty) kickRaster();
        });
    };

    const markStageDirty = () => { rasterDirty = true; kickRaster(); };

    /* Re-raster on real DOM/style mutations of the stage subtree. We
       intentionally observe `subtree:true` so any descendant change
       (slider value, switch state, theme class, etc) triggers it. */
    const obs = new MutationObserver((mutations) => {
      // Ignore mutations that ONLY touched our own host (its CSS bg-color
      // or transform). Those don't change the bg behind us; only the
      // stage's *other* descendants do.
      let stageChanged = false;
      for (const m of mutations) {
        const t = m.target as Node;
        if (host.contains(t)) continue;
        stageChanged = true;
        break;
      }
      if (stageChanged) markStageDirty();
      // Position/color may still have moved; just redraw uniforms.
      requestDraw();
    });
    obs.observe(stage, {
      subtree: true,
      attributes: true,
      childList: true,
      characterData: true,
    });

    /* Re-raster on theme-class toggles on <html>. */
    const rootObs = new MutationObserver(markStageDirty);
    rootObs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    /* Resize → redraw + re-raster. */
    const ro = new ResizeObserver(() => { markStageDirty(); requestDraw(); });
    ro.observe(stage);
    ro.observe(host);

    /* CSS transitions interpolate without firing mutations. Keep redrawing
       while any transition is active in the stage subtree. */
    let activeTransitions = 0;
    let tickRaf = 0;
    const tick = () => {
      requestDraw();
      tickRaf = activeTransitions > 0 ? requestAnimationFrame(tick) : 0;
    };
    const onStart = () => {
      activeTransitions++;
      if (!tickRaf) tickRaf = requestAnimationFrame(tick);
    };
    const onEnd = () => {
      activeTransitions = Math.max(0, activeTransitions - 1);
    };
    stage.addEventListener("transitionrun", onStart);
    stage.addEventListener("transitionend", onEnd);
    stage.addEventListener("transitioncancel", onEnd);

    /* Initial raster + draw. */
    markStageDirty();
    requestDraw();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameRaf);
      if (tickRaf) cancelAnimationFrame(tickRaf);
      obs.disconnect();
      rootObs.disconnect();
      ro.disconnect();
      stage.removeEventListener("transitionrun", onStart);
      stage.removeEventListener("transitionend", onEnd);
      stage.removeEventListener("transitioncancel", onEnd);
      gl.deleteProgram(program);
      gl.deleteBuffer(buf);
      gl.deleteTexture(tex);
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{
        ...style,
        // Match host border-radius to the shader's rounded shape so the
        // host's own bg-color + box-shadow follow the same outline.
        borderRadius: refraction.radius,
      }}
      data-displacement-glass="true"
      {...rest}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          // Mask the canvas to the host's border-radius so the WebGL
          // edge anti-aliasing aligns with the host's rounded corners.
          borderRadius: "inherit",
        }}
      />
    </div>
  );
}

/* ── WebGL helpers ── */

function createProgram(gl: WebGLRenderingContext, vsrc: string, fsrc: string) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsrc);
  if (!vs || !fs) return null;
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error("DisplacementGlass program link error", gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

function compile(gl: WebGLRenderingContext, kind: number, src: string) {
  const s = gl.createShader(kind)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error("DisplacementGlass shader compile error", gl.getShaderInfoLog(s), src);
    return null;
  }
  return s;
}

/* ── CSS color parser (mirrors WebGLGlassOverlay.parseCssColor) ── */

const RGBA_RE = /^rgba?\(([^)]+)\)$/;
function parseCssColor(s: string, out: { r: number; g: number; b: number; a: number }) {
  if (!s || s === "transparent") { out.r = 0; out.g = 0; out.b = 0; out.a = 0; return; }
  const m = s.match(RGBA_RE);
  if (!m) { out.r = 1; out.g = 1; out.b = 1; out.a = 1; return; }
  const p = m[1].split(",").map((x) => parseFloat(x.trim()));
  out.r = (p[0] ?? 255) / 255;
  out.g = (p[1] ?? 255) / 255;
  out.b = (p[2] ?? 255) / 255;
  out.a = p[3] ?? 1;
}
