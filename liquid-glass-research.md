# Liquid Glass CSS/SVG — Research Notes

Research on two implementations of Apple's Liquid Glass effect for the web:

1. **kube.io blog post** — [Liquid Glass CSS SVG](https://kube.io/blog/liquid-glass-css-svg) — first-principles educational walkthrough
2. **@hashintel/refractive** — [GitHub](https://github.com/hashintel/hash/tree/main/libs/%40hashintel/refractive) — production React component library (v0.0.3, MIT/Apache-2.0)

---

## 1. Core Physics: How Light Bending Works

### Snell's Law (Snell–Descartes)

```
n₁ · sin(θ₁) = n₂ · sin(θ₂)
```

- `n₁` = refractive index of first medium (air = 1.0)
- `n₂` = refractive index of second medium (glass ≈ 1.5)
- `θ₁` = angle of incidence
- `θ₂` = angle of refraction

Key behaviors:
- **n₂ = n₁** → light passes straight through (no bending)
- **n₂ > n₁** → ray bends *toward* the normal (into glass)
- **n₂ < n₁** → ray bends *away* from the normal; can cause **total internal reflection**
- **Orthogonal ray** → always passes straight through regardless of indices

### Simplifying Assumptions (Both Implementations)

Both projects constrain the problem to make it tractable for real-time web rendering:

| Constraint | Why |
|---|---|
| Ambient medium index = 1 (air) | Simplifies Snell's law |
| Glass index > 1, prefer 1.5 | Avoids total internal reflection |
| Single refraction event only | Ignores exit/second refraction through back surface |
| Incident rays are orthogonal to background | No perspective — rays come straight down |
| 2D shapes parallel to background | No 3D rotation of the glass |
| No gap between object and background | Only one refraction at the glass surface |

---

## 2. Surface Functions (Glass Shape)

The glass shape is defined by a **height function** `f(x)` where `x` goes from 0 (outer edge) to 1 (end of bezel / start of flat interior). The height determines the surface curvature, which determines how light bends.

### The 4 Surface Equations

```ts
// Convex Circle — simple spherical dome
convexCircle(x) = √(1 - (1-x)²)

// Convex Squircle — Apple's preferred shape, softer transition
convex(x) = ⁴√(1 - (1-x)⁴)

// Concave — bowl-like depression (complement of convex)
concave(x) = 1 - convexCircle(x)

// Lip — blends convex and concave via smootherstep (raised rim, shallow center dip)
lip(x) = mix(convex(x*2), concave(x)+0.1, smootherstep(x))
    where smootherstep(x) = 6x⁵ - 15x⁴ + 10x³
```

### How Surface Normal → Refraction Direction

The surface normal at any point is derived from the **derivative** of the height function:

```ts
const delta = 0.001;
const y1 = f(x - delta);
const y2 = f(x + delta);
const derivative = (y2 - y1) / (2 * delta);
const normal = { x: -derivative, y: 1 }; // rotated by -90°
```

This normal is fed into a simplified refraction function (Snell's Law in vector form):

```ts
// η = 1 / refractiveIndex
// For a fully vertical incident ray [0, 1]:
function refract(normalX, normalY) {
  const dot = normalY;
  const k = 1 - η² * (1 - dot²);
  if (k < 0) return null; // total internal reflection
  const kSqrt = √k;
  return [
    -(η * dot + kSqrt) * normalX,  // refracted X
    η - (η * dot + kSqrt) * normalY // refracted Y
  ];
}
```

### Key Insight: Displacement

The final pixel displacement is calculated by following the refracted ray through the remaining glass thickness:

```ts
displacement_x = refracted[0] * (remainingHeight / refracted[1])
```

Where `remainingHeight = bezelHeight + glassThickness`. This gives us **how far each pixel should be shifted** from its original position.

---

## 3. Displacement Vector Field

### Pre-computation Strategy

Since displacement magnitude is **symmetric around the bezel** (same distance from border = same displacement), both implementations pre-compute displacement for a single radial slice (128 samples) and rotate it around the shape.

Steps:
1. Sample 128 points along one radius
2. For each: compute surface normal → apply Snell's law → compute displacement
3. Store as a 1D array of displacement magnitudes
4. Find `maximumDisplacement = max(|displacements|)`
5. Normalize all displacements by dividing by `maximumDisplacement`

### 2D Vector Field

For each pixel in the glass shape:
1. Calculate `angle` from center to pixel (atan2)
2. Look up displacement magnitude from pre-computed array based on distance from border
3. Project displacement along the angle: `dX = -cos(angle) * displacement`, `dY = -sin(angle) * displacement`

---

## 4. SVG Displacement Map

### How `<feDisplacementMap>` Works

An SVG displacement map is an **RGBA image** where each pixel's color tells the browser how far to shift the corresponding source pixel.

- **Red channel** → X-axis displacement
- **Green channel** → Y-axis displacement
- 8-bit per channel → 256 possible values (0-255)
- **128 = neutral** (no displacement)
- 0 → maximum negative shift, 255 → maximum positive shift
- The `scale` attribute multiplies the normalized displacement to get pixel units

### Color Encoding

```ts
// Convert normalized displacement vector to pixel color:
buffer[offset]     = 128 + dX * 127 * opacity;  // R → X displacement
buffer[offset + 1] = 128 + dY * 127 * opacity;  // G → Y displacement
buffer[offset + 2] = 0;                           // B → unused
buffer[offset + 3] = 255;                         // A → full opacity
```

### Scale

The `scale` attribute on `<feDisplacementMap>` re-maps the normalized image values back to actual pixel distances:

```xml
<feDisplacementMap
  in="blurred_source"
  in2="displacement_map"
  scale={maximumDisplacement * scaleRatio}
  xChannelSelector="R"
  yChannelSelector="G"
/>
```

This means `scale = maximumDisplacement` converts back to exact physics. Animating `scale` lets you fade the effect without recomputing the map.

---

## 5. Specular Highlight

A simple **rim light** effect — the highlight appears around the edges of the glass, with intensity varying based on the angle of the surface normal relative to a fixed light direction.

### Calculation (from @hashintel/refractive)

```ts
// specularAngle = direction of the virtual light source (default π/4 = 45°)
const specular_vector = [cos(specularAngle), sin(specularAngle)];

// For each pixel near the edge:
const dotProduct = |cos(pixelAngle) · specular_vector[0] + sin(pixelAngle) · specular_vector[1]|;
const coefficient = dotProduct * √(1 - (1 - distanceFromSide/pixelRatio)²);
const color = 255 * coefficient;
const alpha = color * coefficient * opacity;
```

This produces a bright ring near the edge of the glass shape, strongest where the edge normal aligns with the specular direction.

### Compositing

The specular is composited on top of the displaced image:
1. Convert specular map to alpha using `luminanceToAlpha`
2. Apply opacity scaling with `feComponentTransfer`
3. Flood white, mask with specular alpha
4. Composite over the displaced source

---

## 6. The @hashintel/refractive Library — Architecture

### Package Info
- **Name:** `@hashintel/refractive`
- **Version:** 0.0.3
- **License:** MIT OR Apache-2.0
- **Peer deps:** React 19
- **Build:** Vite 8, Storybook 10

### File Structure

```
src/
├── main.ts                          # Exports: refractive HOC + surface equations
├── hoc/
│   └── refractive.tsx               # The main HOC + Proxy-based API
├── components/
│   ├── filter.tsx                   # SVG <filter> that combines displacement + specular + blur
│   └── composite-parts.tsx          # Splits map into 9 parts (corners/edges/center) for scalability
├── helpers/
│   ├── surface-equations.ts         # convexCircle, convex, concave, lip
│   ├── image-data-to-url.ts         # ImageData → data URL via canvas
│   └── split-imagedata-to-parts.ts  # 9-slice split for scalable maps
└── maps/
    ├── displacement-map.ts          # Snell's law refraction + displacement calculation
    ├── specular.ts                  # Specular highlight map generation
    ├── calculate-circle-map.ts      # Circle/rounded-rect pixel iterator
    ├── calculate-rounded-square-map.ts # Extended iterator for bezel > radius
    └── process-pixel.type.ts        # Shared ProcessPixelFunction type
```

### How It Works End-to-End

1. **`refractive` HOC** wraps any React component or HTML element via Proxy:
   ```tsx
   <refractive.div refraction={{ radius: 12, blur: 4, bezelWidth: 10 }} />
   ```
2. A **ResizeObserver** watches the element and feeds width/height to the filter
3. **`calculateDisplacementMapRadius`** pre-computes 128 displacement samples along one radial slice using Snell's Law
4. **`calculateDisplacementMap`** generates a full 2D displacement ImageData:
   - Uses `calculateRoundedSquareMap` (or `calculateCircleMap` if bezel ≤ radius)
   - For each pixel: looks up pre-computed displacement by distance from border, projects along angle, encodes to R/G channels
5. **`calculateSpecularImage`** generates a specular highlight ImageData (edge rim light)
6. **`splitImageDataToParts`** does a **9-slice split** of both maps:
   - 4 corners, 4 edges (top/bottom/left/right), 1 center
   - Each slice → canvas → data URL (base64 PNG)
   - This enables **scaling**: corners are fixed, edges stretch along one axis, center stretches freely
7. **`<Filter>`** component assembles the SVG filter chain:
   - `feGaussianBlur` → blur the source
   - `CompositeParts` × 2 → displacement map + specular map (9 `feImage` + `feComposite` each)
   - `feDisplacementMap` → apply refraction
   - `feColorMatrix luminanceToAlpha` → extract specular alpha
   - `feComponentTransfer` → control specular opacity
   - `feFlood white` + `feComposite in` → white specular mask
   - `feComposite over` → final composite
8. The filter is applied via `backdrop-filter: url(#filterId)` on the wrapped element

### Refraction Props

| Prop | Default | Description |
|---|---|---|
| `radius` | (required) | Border radius in px |
| `blur` | 0 | Gaussian blur strength |
| `glassThickness` | 70 | Virtual glass thickness (more = more displacement) |
| `bezelWidth` | 0 | Width of the curved edge (0 = no refraction visible) |
| `refractiveIndex` | 1.5 | Index of refraction (glass) |
| `specularOpacity` | 0 | Brightness of specular highlight (0 = off) |
| `specularAngle` | 0 | Direction of virtual light for specular |
| `bezelHeightFn` | `convex` (squircle) | Surface function defining glass curvature |

### The 9-Slice Trick

A crucial optimization: displacement and specular maps are computed at a **small fixed size** (`cornerWidth * 2 + 1` pixels, scaled by `pixelRatio=6`), then sliced into 9 parts. The browser's SVG engine stretches the edge/center slices to match the actual element dimensions. This means:

- Map computation cost is **independent of element size**
- Only depends on `bezelWidth`, `radius`, and `pixelRatio`
- Re-rendering only when refraction props change, not on resize (the 9-slice stretching handles it)

---

## 7. Browser Compatibility

| Feature | Chrome | Firefox | Safari |
|---|---|---|---|
| SVG `<feDisplacementMap>` as `filter` | ✅ | ✅ | ✅ |
| SVG filters as `backdrop-filter` | ✅ | ❌ | ❌ |

**Critical limitation:** Only Chrome (Chromium) supports using SVG filters as `backdrop-filter`. This is essential for the glass effect because `backdrop-filter` samples the *content behind* the element, which is what creates the refraction illusion.

**Workaround options:**
- Use regular `filter` instead (but it filters the element itself, not the backdrop)
- Layer a blurred copy of the background manually
- Viable in Electron / Chromium-based runtimes

---

## 8. Performance Considerations

- **Map generation is CPU-bound:** 128 ray simulations + pixel-by-pixel ImageData generation + canvas→data URL conversion
- **Map is static per config:** Only needs recomputation when refraction props change (not on resize, thanks to 9-slice)
- **`scale` is animatable:** Can fade effect in/out by animating the `<feDisplacementMap scale>` attribute without recomputing maps
- **`pixelRatio` is fixed at 6:** Higher = sharper maps but more pixels to compute
- **ResizeObserver overhead:** The HOC uses ResizeObserver + useState, which triggers React re-renders on resize → the `<Filter>` component recalculates its feImage positions (but not the underlying map data)
- **TODO from source (FE-43):** Plans to use `objectBoundingBox` SVG units to auto-size the filter, eliminating ResizeObserver/useState entirely

---

## 9. Key Differences Between the Two Implementations

| Aspect | kube.io Blog | @hashintel/refractive |
|---|---|---|
| **Purpose** | Educational deep-dive | Production library |
| **Format** | Vanilla JS/SVG tutorial | React HOC (TypeScript) |
| **Shapes** | Circles only | Circles + rounded rectangles (9-slice) |
| **Surface functions** | 4 (convexCircle, convex, concave, lip) | Same 4, exported for reuse |
| **Specular** | Configurable angle/opacity | Same, built into filter chain |
| **Scalability** | Single displacement map image | 9-slice split (size-independent rendering) |
| **Component patterns** | Manual SVG filter setup | HOC + Proxy (`refractive.div`, `refractive(Button)`) |
| **DX** | Copy-paste examples | `npm install @hashintel/refractive` |

---

## 10. Summary: The Rendering Pipeline

```
Surface Function f(x)
        │
        ▼
Surface Normal (derivative of f)
        │
        ▼
Snell's Law (vector refraction)
        │
        ▼
Displacement per distance-from-border (128 samples)
        │
        ▼
2D Displacement Map (ImageData, R=dX, G=dY)
        │
        ├──► 9-slice split → feImage × 9 → feComposite
        │
        ▼
SVG Filter Chain:
  feGaussianBlur → feDisplacementMap(scale=maxDisplacement)
                 → feBlend with Specular Highlight
                 → Final composite
        │
        ▼
Applied via: backdrop-filter: url(#filterId)
```
