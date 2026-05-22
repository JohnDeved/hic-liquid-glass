# hic-liquid-glass

Apple-style **Liquid Glass** UI components, recreated in the browser on top of
the new [**HTML-in-Canvas (HIC)**][hic] API.

A side-by-side demo of two complementary techniques for real-time refraction of
live page content — one cross-browser via WebGL + a custom GLSL shader, one
Chromium-only via pure CSS.

🌐 **Live demo:** <https://hic-liquid-glass.pages.dev>

[hic]: https://github.com/WICG/html-in-canvas

## What it shows

Each demo (Switch, Slider) is rendered twice, with the same draggable, springy
interaction, so you can compare the two backends pixel-for-pixel:

| Backend                            | Tech                                                              | Browser support  |
| ---------------------------------- | ----------------------------------------------------------------- | ---------------- |
| **WebGL + GLSL**                   | HTML-in-Canvas raster + custom fragment shader (Snell's law port) | All modern       |
| **`@hashintel/refractive`** (CSS)  | SVG displacement filter feeding `backdrop-filter`                 | Chromium only    |

The WebGL path uses [`three-html-render`][thr]'s polyfill so the texture
capture works everywhere — native `drawElement()` where available, an
`<foreignObject>` SVG fallback elsewhere. The shader is a faithful port of
[`@hashintel/refractive`][hashintel]'s bezel + refraction math, so both panels
in the demo produce visually equivalent output.

[thr]: https://www.npmjs.com/package/three-html-render
[hashintel]: https://github.com/hashintel/hash/tree/main/libs/%40hashintel/refractive

## Stack

- React 19 + TypeScript
- Vite 8
- Tailwind 4 (via `@tailwindcss/vite`)
- `@hashintel/refractive` — CSS backend reference
- `three-html-render` — HIC polyfill for the WebGL backend
- `@use-gesture/react` — drag + spring physics on the switch/slider thumbs
- oxc-standard (oxlint + oxfmt) — lint and format

## Run it

```sh
npm install
npm run dev
```

| Script            | What it does                                  |
| ----------------- | --------------------------------------------- |
| `npm run dev`     | Vite dev server with HMR                      |
| `npm run build`   | `tsc -b && vite build`                        |
| `npm run preview` | Serve the production build                    |
| `npm run lint`    | `oxlint --fix .` followed by `oxfmt .`        |

## Layout

```
src/
├── App.tsx                       # 2×2 grid: {Switch, Slider} × {WebGL, refractive}
├── main.tsx                      # installs the three-html-render HIC polyfill
├── components/
│   ├── GlassBackend.tsx          # context switching WebGL ↔ refractive per demo
│   ├── GlassRect.tsx             # picks the backend component
│   ├── DisplacementGlass.tsx     # WebGL backend (HIC → texture → shader)
│   ├── DemoShell.tsx             # shared chrome (title, params panel, theme)
│   └── …
├── demos/
│   ├── SwitchDemo.tsx
│   └── SliderDemo.tsx
├── shaders/
│   └── glass.frag                # GLSL refraction (port of @hashintel/refractive)
└── hooks/
    └── useRefractionParams.ts    # shared IOR / blur / bezel-height controls
```

## Credits

Inspired by [@kube_io's CSS-only liquid glass write-up][kube] and the
[Hash team's `@hashintel/refractive`][hashintel].

[kube]: https://kube.io/blog/liquid-glass-css-svg
