import { SwitchDemo } from './demos/SwitchDemo'
import { SliderDemo } from './demos/SliderDemo'
import { GlassBackendProvider, type GlassBackend } from './components/GlassBackend'
import { ThemeProvider } from './theme'
import { useTheme } from './themeContext'

const BACKENDS: GlassBackend[] = ['webgl', 'refractive']
const BADGE =
  'inline-block text-[0.7rem] px-2.5 py-0.5 rounded-[5px] tracking-[0.02em] normal-case border'
const LINK = 'text-inherit underline underline-offset-2'

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle color theme"
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="fixed top-3 right-3 lg:top-5 lg:right-5 z-50 inline-flex items-center justify-center w-10 h-10 lg:w-11 lg:h-11 rounded-full border border-[var(--ui-border)] bg-[var(--bg1)] shadow-lg hover:scale-105 active:scale-95 transition-transform text-xl"
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <div className="min-h-screen bg-[var(--bg2)] text-[var(--c-text)] font-sans relative">
        <ThemeToggle />
        <header className="text-center pt-10 lg:pt-12 px-4 lg:px-6 pb-3">
          <h1 className="text-2xl lg:text-[2rem] font-bold mb-2">Liquid Glass Components</h1>
          <p className="text-sm opacity-60 mb-3">
            WWDC 2025 Liquid Glass, recreated in the browser. Inspired by{' '}
            <a
              href="https://kube.io/blog/liquid-glass-css-svg"
              target="_blank"
              rel="noreferrer"
              className={LINK}
            >
              kube.io
            </a>
            .
          </p>
        </header>
        <main className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4 max-w-[1400px] mx-auto px-4 lg:px-6 pb-16 relative lg:before:content-[''] lg:before:absolute lg:before:top-0 lg:before:bottom-0 lg:before:left-1/2 lg:before:w-px lg:before:bg-[var(--ui-border)]">
          <div className="mb-6">
            <div className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] opacity-50">
              WebGL + GLSL · via{' '}
              <a
                href="https://github.com/WICG/html-in-canvas"
                target="_blank"
                rel="noreferrer"
                className={LINK}
              >
                HTML-in-Canvas
              </a>{' '}
              <span
                className={`${BADGE} bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400`}
              >
                Cross-browser
              </span>
            </div>
            <p className="text-[0.82rem] opacity-55 mt-2 leading-relaxed">
              A GLSL shader warps a snapshot of the HTML behind the element, taken with the new
              HTML-in-Canvas API (or a foreignObject SVG fallback). Works in every browser.
            </p>
          </div>
          <div className="mb-6">
            <div className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] opacity-50">
              Using{' '}
              <a
                href="https://github.com/hashintel/hash/tree/main/libs/%40hashintel/refractive"
                target="_blank"
                rel="noreferrer"
                className="text-inherit underline"
              >
                @hashintel/refractive
              </a>{' '}
              <span
                className={`${BADGE} bg-yellow-500/15 border-yellow-500/30 text-yellow-600 dark:text-amber-400`}
              >
                Chrome only
              </span>
            </div>
            <p className="text-[0.82rem] opacity-55 mt-2 leading-relaxed">
              Pure CSS. An SVG displacement filter feeds{' '}
              <code className="text-[0.78rem] px-1 py-0.5 rounded bg-[var(--ui-border)]">
                backdrop-filter
              </code>
              , which warps the pixels already behind the element. No texture capture, no shader.
              Only works in Chromium-based browsers right now.
            </p>
          </div>

          {[SwitchDemo, SliderDemo].flatMap(Demo =>
            BACKENDS.map((backend, i) => (
              <GlassBackendProvider key={`${Demo.name}-${backend}`} value={backend}>
                <div className={i > 0 ? 'is-secondary contents' : 'contents'}>
                  <Demo />
                </div>
              </GlassBackendProvider>
            ))
          )}
        </main>
        <footer className="text-center py-5 px-6 text-xs opacity-40 border-t border-[var(--ui-border)]">
          Johann Berger · 2025
        </footer>
      </div>
    </ThemeProvider>
  )
}
