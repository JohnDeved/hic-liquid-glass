precision highp float;

uniform sampler2D sceneTex;
uniform vec2 resolution;       // viewport / FBO size in pixels (canvas backbuffer size, CSS px)
uniform vec2 stageSize;        // sceneTex source size in CSS pixels (full stage)
uniform vec2 canvasCenter;     // canvas center within the stage, CSS pixels (TL origin, y-down)
uniform vec2 glassSize;        // glass plane size in pixels
uniform vec2 thumbPos;         // glass center in world coords (updated per-frame)
uniform float cornerRadius;    // corner radius in pixels
uniform float bezelWidth;      // width of the curved bezel zone in pixels
uniform float glassThickness;  // virtual glass thickness (refraction strength)
uniform float ior;             // index of refraction (default 1.5)
uniform float blurAmount;      // gaussian blur std-deviation in pixels
uniform float specularOpacity; // strength of the specular highlight
uniform float dispersion;      // edge chromatic + edge blur boost intensity (0..1)
uniform int bezelType;         // 0 = lip, 1 = convex, 2 = concave, 3 = convexCircle
uniform vec4 bgColor;          // pill's own bg color, composited OVER refraction (matches backdrop-filter)

varying vec2 vUv;

/* ── Bezel height functions (match @hashintel/refractive exactly) ── */

float convexCircleFn(float x) {
  float t = 1.0 - x;
  return sqrt(max(1.0 - t * t, 0.0));
}

float convexFn(float x) {
  float t = 1.0 - x;
  float t4 = t * t * t * t;
  return pow(max(1.0 - t4, 0.0), 0.25);
}

float concaveFn(float x) {
  return 1.0 - convexCircleFn(x);
}

float lipFn(float x) {
  float a = convexFn(x * 2.0);
  float b = concaveFn(x) + 0.1;
  // smoothstep polynomial: 6x^5 - 15x^4 + 10x^3
  float t = x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
  return mix(a, b, t);
}

float bezelHeight(float x) {
  float cx = clamp(x, 0.0, 1.0);
  if (bezelType == 0) return lipFn(cx);
  if (bezelType == 1) return convexFn(cx);
  if (bezelType == 2) return concaveFn(cx);
  return convexCircleFn(cx);
}

/* ── Snell's law refraction (exact port of refractive library) ── */
// Returns pixel displacement for a given surface normal.
// Incident ray = (0, -1) looking straight down onto the surface.
// Normal = (-dh/ds, -1) / length — as in the refractive library.

float snellDisplacement(float normalX, float normalY, float height, float bw, float thickness, float refIdx) {
  float sinRatio = 1.0 / refIdx;
  float cosI = normalY;
  float sin2T = sinRatio * sinRatio * (1.0 - cosI * cosI);
  float cos2T = 1.0 - sin2T;
  if (cos2T < 0.0) return 0.0; // total internal reflection
  float cosT = sqrt(cos2T);
  float refractedX = -(sinRatio * cosI + cosT) * normalX;
  float refractedY = sinRatio - (sinRatio * cosI + cosT) * normalY;
  if (abs(refractedY) < 0.0001) return 0.0;
  float totalHeight = height * bw + thickness;
  return refractedX * (totalHeight / refractedY);
}

/* ── Rounded rect SDF ── */

float roundedBoxSDF(vec2 p, vec2 b, float r) {
  vec2 d = abs(p) - b + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

/* ── Specular highlight (matches refractive's specular map) ── */
// Thin ring near border (~2px wide), modulated by angle with specular direction.
// Library uses specularAngle = PI/4 (upper-right light source).

const float SPECULAR_EDGE = 20.0;
const vec2 SPECULAR_DIR = vec2(0.7071, 0.7071); // cos(PI/4), sin(PI/4)

float computeSpecular(float distToBorder, vec2 borderDir) {
  if (distToBorder >= SPECULAR_EDGE) return 0.0;
  // Library direction: (dx/dist, -dy/dist) in screen coords — flip y for GL
  vec2 dir = vec2(borderDir.x, -borderDir.y);
  float dl = length(dir);
  if (dl < 0.001) return 0.0;
  dir /= dl;
  float angleDot = abs(dot(dir, SPECULAR_DIR));
  // Circular fade: peaks at 1px from border, zero at border and ~2px inside
  float inner = 1.0 - (1.0 - distToBorder) * (1.0 - distToBorder);
  float fade = inner > 0.0 ? sqrt(inner) : 0.0;
  return angleDot * fade;
}

void main() {
  // Local position in pixels relative to glass center
  vec2 localPx = (vUv - 0.5) * glassSize;

  // Rounded rect SDF
  vec2 halfSize = glassSize * 0.5;
  float r = min(cornerRadius, min(halfSize.x, halfSize.y));
  float dist = roundedBoxSDF(localPx, halfSize, r);

  // Discard outside rounded rect (with 1px AA band)
  if (dist > 1.0) discard;
  float edgeAlpha = 1.0 - smoothstep(-0.5, 0.5, dist);

  // Distance to border (positive inside)
  float distToBorder = max(0.0, -dist);

  // sceneTex sampling is in stage coords (canvas may be smaller than stage now)
  vec2 mp = thumbPos + localPx;
  vec2 sceneUV = vec2(
    (canvasCenter.x + mp.x) / stageSize.x,
    (stageSize.y - canvasCenter.y + mp.y) / stageSize.y
  );

  // Compute displacement in the bezel zone
  vec2 displacement = vec2(0.0);
  float specularValue = 0.0;
  float edgeFactor = 0.0; // 0 in flat center, 1 at the bezel rim

  float bw = min(bezelWidth, min(halfSize.x, halfSize.y));

  if (distToBorder < bw && bw > 0.5) {
    float normalizedDist = distToBorder / bw; // 0 at border → 1 inside
    edgeFactor = 1.0 - normalizedDist;

    // Bezel height and derivative
    float h = bezelHeight(normalizedDist);
    float eps = 0.001;
    float h2 = bezelHeight(normalizedDist + eps);
    float dh = (h2 - h) / eps;

    // Surface normal (matching refractive: (-dh/ds, -1) / length)
    float nLen = sqrt(dh * dh + 1.0);
    float nx = -dh / nLen;
    float ny = -1.0 / nLen;

    // Snell's law displacement (in pixels)
    float pixelDisp = snellDisplacement(nx, ny, h, bw, glassThickness, ior);

    // Direction: SDF gradient points outward (toward nearest border)
    float sdxR = roundedBoxSDF(localPx + vec2(0.5, 0.0), halfSize, r);
    float sdxL = roundedBoxSDF(localPx - vec2(0.5, 0.0), halfSize, r);
    float sdyR = roundedBoxSDF(localPx + vec2(0.0, 0.5), halfSize, r);
    float sdyL = roundedBoxSDF(localPx - vec2(0.0, 0.5), halfSize, r);
    vec2 borderDir = vec2(sdxR - sdxL, sdyR - sdyL);
    float bdLen = length(borderDir);
    if (bdLen > 0.001) borderDir /= bdLen;

    // Apply displacement in radial direction (inward, matching refractive's -cos/-sin).
    // Scale by 127/255 to match SVG feDisplacementMap 8-bit channel encoding
    // (channel range 0.5±0.498, so effective displacement is ~49.8% of raw value).
    displacement = -borderDir * pixelDisp * (127.0 / 255.0);

    // Smooth fade at the very edge for anti-aliasing
    float edgeFade = smoothstep(0.0, 2.0, distToBorder);
    displacement *= edgeFade;

    // Specular (thin ring at border, independent of displacement edgeFade)
    specularValue = computeSpecular(distToBorder, borderDir);
  }

  // Sample scene texture with displacement
  vec2 displacedUV = sceneUV + displacement / stageSize;
  displacedUV = clamp(displacedUV, vec2(0.001), vec2(0.999));

  // Chromatic aberration: split R/B sampling along the displacement vector,
  // strongest at the bezel rim, zero in the flat center. Scaled by dispersion.
  vec2 aberrOffset = (displacement / stageSize) * (0.35 * dispersion * edgeFactor);

  // Edge-amplified blur: ADDS its own sigma budget at the rim (driven by
  // dispersion alone) on top of the user-set base blur. Center stays sharp;
  // the rim softens like the smeared fall-off in Apple's Liquid Glass.
  float effSigma = blurAmount + dispersion * edgeFactor * edgeFactor * 10.0;

  // Gaussian blur (only when effective sigma > threshold)
  vec4 sceneColor;
  if (effSigma > 0.5) {
    sceneColor = vec4(0.0);
    float total = 0.0;
    float sigma = effSigma;
    int rad = int(min(ceil(sigma * 2.5), 12.0));
    for (int y = -12; y <= 12; y++) {
      for (int x = -12; x <= 12; x++) {
        int ax = x < 0 ? -x : x;
        int ay = y < 0 ? -y : y;
        if (ax > rad || ay > rad) continue;
        float w = exp(-float(x * x + y * y) / (2.0 * sigma * sigma));
        vec2 off = vec2(float(x), float(y)) / stageSize;
        float r = texture2D(sceneTex, displacedUV + off + aberrOffset).r;
        float g = texture2D(sceneTex, displacedUV + off).g;
        float b = texture2D(sceneTex, displacedUV + off - aberrOffset).b;
        float a = texture2D(sceneTex, displacedUV + off).a;
        sceneColor += vec4(r, g, b, a) * w;
        total += w;
      }
    }
    sceneColor /= total;
  } else {
    float r = texture2D(sceneTex, displacedUV + aberrOffset).r;
    float g = texture2D(sceneTex, displacedUV).g;
    float b = texture2D(sceneTex, displacedUV - aberrOffset).b;
    float a = texture2D(sceneTex, displacedUV).a;
    sceneColor = vec4(r, g, b, a);
  }

  // Composite the pill's own bg-color OVER the refracted scene. This mirrors
  // how CSS `backdrop-filter` works: refract what's behind, then paint the
  // element's own background on top. The placeholder DOM is invisible (opacity:0)
  // so it doesn't contaminate the HIC capture — bgColor here IS its bg.
  sceneColor.rgb = mix(sceneColor.rgb, bgColor.rgb, bgColor.a);

  // Apple-style outer rim highlight: a single continuous bright band hugging
  // the perimeter. Uses specularOpacity to stay user-controllable.
  vec3 rimTint = vec3(0.88, 0.97, 1.0); // slight cool/cyan cast
  float outerRim = exp(-pow((distToBorder - 1.2) / 1.4, 2.0));
  float rimAlpha = outerRim * 0.6 * specularOpacity;
  sceneColor.rgb = mix(sceneColor.rgb, rimTint, rimAlpha);

  // Add specular highlight (white overlay)
  float specAlpha = specularValue * specularOpacity;
  sceneColor.rgb = mix(sceneColor.rgb, vec3(1.0), specAlpha);

  vec3 finalColor = sceneColor.rgb;

  gl_FragColor = vec4(finalColor, edgeAlpha);
}
