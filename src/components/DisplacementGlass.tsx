import { useEffect, useRef, type HTMLAttributes } from 'react'
import { lip } from '@hashintel/refractive'
import { getHtmlRenderer } from 'three-html-render/polyfill'
import type { GlassRefractionParams } from './GlassRect'
import fragShader from '../shaders/glass.frag?raw'

/**
 * Real CSS-styled <div> + child <canvas> that paints only the bezel
 * refraction. Samples a texture of the nearest `[data-glass-stage]`
 * ancestor (raster'd via three-html-render's polyfill, on mutation only).
 * Per frame we just re-measure the host bbox and push uniforms — no
 * JS-driven position/color animation, no per-frame raster.
 */
interface Props extends HTMLAttributes<HTMLDivElement> {
  refraction: GlassRefractionParams
}

const VERT = `
  attribute vec2 a_position;
  attribute vec2 a_uv;
  varying vec2 vUv;
  void main() { vUv = a_uv; gl_Position = vec4(a_position, 0.0, 1.0); }
`

const QUAD = new Float32Array([
  -1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, -1, 1, 0, 1, 1, -1, 1, 0, 1, 1, 1, 1,
])

const UNIFORM_NAMES = [
  'sceneTex',
  'resolution',
  'stageSize',
  'canvasCenter',
  'glassSize',
  'thumbPos',
  'cornerRadius',
  'bezelWidth',
  'glassThickness',
  'ior',
  'blurAmount',
  'specularOpacity',
  'dispersion',
  'bezelType',
  'bgColor',
] as const
type UniformName = (typeof UNIFORM_NAMES)[number]

export function DisplacementGlass({ refraction, className, style, ...rest }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const refractionRef = useRef(refraction)
  refractionRef.current = refraction

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    const stage = host.closest<HTMLElement>('[data-glass-stage]')
    if (!stage) return

    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    })
    if (!gl) return

    const program = createProgram(gl, VERT, fragShader)
    if (!program) return
    gl.useProgram(program)

    const u = Object.fromEntries(
      UNIFORM_NAMES.map(n => [n, gl.getUniformLocation(program, n)])
    ) as Record<UniformName, WebGLUniformLocation | null>

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(program, 'a_position')
    const aUv = gl.getAttribLocation(program, 'a_uv')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(aUv)
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8)

    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.uniform1i(u.sceneTex, 0)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let lastW = 0,
      lastH = 0,
      texW = 0,
      texH = 0
    let frameRaf = 0,
      renderPending = false
    const bg = { r: 1, g: 1, b: 1, a: 1 }

    const draw = () => {
      renderPending = false
      const hr = host.getBoundingClientRect()
      const sr = stage.getBoundingClientRect()
      if (hr.width <= 0 || hr.height <= 0) return

      const layoutW = host.offsetWidth,
        layoutH = host.offsetHeight
      const bw = Math.max(1, Math.round(layoutW * dpr))
      const bh = Math.max(1, Math.round(layoutH * dpr))
      if (bw !== lastW || bh !== lastH) {
        canvas.width = bw
        canvas.height = bh
        lastW = bw
        lastH = bh
      }
      gl.viewport(0, 0, bw, bh)

      // CSS transitions animate bg-color on the compositor; reading
      // computedStyle each frame tracks the interpolated value.
      parseCssColor(getComputedStyle(host).backgroundColor, bg)

      const r = refractionRef.current
      gl.uniform2f(u.resolution, layoutW, layoutH)
      gl.uniform2f(u.stageSize, sr.width, sr.height)
      gl.uniform2f(
        u.canvasCenter,
        hr.left + hr.width / 2 - sr.left,
        hr.top + hr.height / 2 - sr.top
      )
      gl.uniform2f(u.glassSize, layoutW, layoutH)
      gl.uniform2f(u.thumbPos, 0, 0)
      gl.uniform1f(u.cornerRadius, r.radius)
      gl.uniform1f(u.bezelWidth, r.bezelWidth)
      gl.uniform1f(u.glassThickness, r.glassThickness)
      gl.uniform1f(u.ior, r.refractiveIndex)
      gl.uniform1f(u.blurAmount, r.blur)
      gl.uniform1f(u.specularOpacity, r.specularOpacity)
      gl.uniform1f(u.dispersion, r.dispersion ?? 0)
      gl.uniform1i(u.bezelType, r.bezelHeightFn === lip ? 0 : 1)
      gl.uniform4f(u.bgColor, bg.r, bg.g, bg.b, bg.a)

      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      if (texW > 0 && texH > 0) {
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }
    }

    const requestDraw = () => {
      if (renderPending) return
      renderPending = true
      frameRaf = requestAnimationFrame(draw)
    }

    let rasterPending = false,
      rasterDirty = true,
      rasterRaf = 0
    let disposed = false

    const kickRaster = () => {
      if (disposed || rasterPending || !rasterDirty) return
      rasterPending = true
      rasterDirty = false
      // Hide the host ONLY during the polyfill's synchronous cloneNode in
      // update(). Restoring visibility in the same JS task means the
      // browser never paints a hidden frame (no flash) but the captured
      // texture omits our own pixels — otherwise the bezel would sample
      // the thumb refracting itself.
      host.style.visibility = 'hidden'
      const p = getHtmlRenderer().update(stage)
      host.style.visibility = ''
      p.then(src => {
        if (disposed) return
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
        texW = src.width
        texH = src.height
        requestDraw()
      })
        .catch(() => {
          if (!disposed) rasterDirty = true
        })
        .finally(() => {
          if (disposed) return
          rasterPending = false
          if (rasterDirty) markStageDirty()
        })
    }

    // Coalesce mutation bursts (slider drag, etc.) into one raster per
    // frame instead of one per mutation.
    const markStageDirty = () => {
      rasterDirty = true
      if (rasterRaf || rasterPending) return
      rasterRaf = requestAnimationFrame(() => {
        rasterRaf = 0
        kickRaster()
      })
    }

    // Stage mutations that aren't inside the host change the bg behind
    // us → re-raster. Same-host mutations still warrant a uniform redraw
    // (position/color may have moved).
    const obs = new MutationObserver(muts => {
      if (muts.some(m => !host.contains(m.target))) markStageDirty()
      requestDraw()
    })
    obs.observe(stage, { subtree: true, attributes: true, childList: true, characterData: true })

    const rootObs = new MutationObserver(markStageDirty)
    rootObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    const ro = new ResizeObserver(() => {
      markStageDirty()
      requestDraw()
    })
    ro.observe(stage)
    ro.observe(host)

    // CSS transitions don't fire mutations; rAF-poll while any are active.
    let activeTransitions = 0,
      tickRaf = 0
    const tick = () => {
      requestDraw()
      tickRaf = activeTransitions > 0 ? requestAnimationFrame(tick) : 0
    }
    const onStart = () => {
      activeTransitions++
      if (!tickRaf) tickRaf = requestAnimationFrame(tick)
    }
    const onEnd = () => {
      activeTransitions = Math.max(0, activeTransitions - 1)
    }
    stage.addEventListener('transitionrun', onStart)
    stage.addEventListener('transitionend', onEnd)
    stage.addEventListener('transitioncancel', onEnd)

    markStageDirty()
    requestDraw()

    return () => {
      disposed = true
      cancelAnimationFrame(frameRaf)
      if (tickRaf) cancelAnimationFrame(tickRaf)
      if (rasterRaf) cancelAnimationFrame(rasterRaf)
      obs.disconnect()
      rootObs.disconnect()
      ro.disconnect()
      stage.removeEventListener('transitionrun', onStart)
      stage.removeEventListener('transitionend', onEnd)
      stage.removeEventListener('transitioncancel', onEnd)
      gl.deleteProgram(program)
      gl.deleteBuffer(buf)
      gl.deleteTexture(tex)
    }
  }, [])

  return (
    <div
      ref={hostRef}
      className={className}
      style={{
        ...style,
        borderRadius: refraction.radius,
      }}
      data-displacement-glass="true"
      {...rest}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          borderRadius: 'inherit',
        }}
      />
    </div>
  )
}

function createProgram(gl: WebGLRenderingContext, vsrc: string, fsrc: string) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsrc)
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsrc)
  if (!vs || !fs) return null
  const p = gl.createProgram()!
  gl.attachShader(p, vs)
  gl.attachShader(p, fs)
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error('DisplacementGlass program link error', gl.getProgramInfoLog(p))
    return null
  }
  return p
}

function compile(gl: WebGLRenderingContext, kind: number, src: string) {
  const s = gl.createShader(kind)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('DisplacementGlass shader compile error', gl.getShaderInfoLog(s), src)
    return null
  }
  return s
}

const RGBA_RE = /^rgba?\(([^)]+)\)$/
function parseCssColor(s: string, out: { r: number; g: number; b: number; a: number }) {
  if (!s || s === 'transparent') {
    out.r = 0
    out.g = 0
    out.b = 0
    out.a = 0
    return
  }
  const m = s.match(RGBA_RE)
  if (!m) {
    out.r = 1
    out.g = 1
    out.b = 1
    out.a = 1
    return
  }
  const p = m[1].split(',').map(x => parseFloat(x.trim()))
  out.r = (p[0] ?? 255) / 255
  out.g = (p[1] ?? 255) / 255
  out.b = (p[2] ?? 255) / 255
  out.a = p[3] ?? 1
}
