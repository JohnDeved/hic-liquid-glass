import { CustomSwitchDemo, CustomSliderDemo } from "./demos/custom";
import { RefractiveSwitchDemo, RefractiveSliderDemo } from "./demos/refractive";

export default function App() {
  return (
    <div className="dark min-h-screen bg-[var(--bg2)] text-[var(--c-text)] font-sans">
      <header className="text-center pt-12 px-6 pb-3">
        <h1 className="text-[2rem] font-bold mb-2">Liquid Glass Components</h1>
        <p className="text-sm opacity-60 mb-3">
          Recreating Apple's WWDC 2025 Liquid Glass effect — inspired by{" "}
          <a href="https://kube.io/blog/liquid-glass-css-svg" target="_blank" rel="noreferrer"
            className="text-inherit underline underline-offset-2">
            kube.io
          </a>
        </p>
      </header>
      <main className="grid grid-cols-2 gap-x-8 gap-y-4 max-w-[1400px] mx-auto px-6 pb-16 relative before:content-[''] before:absolute before:top-0 before:bottom-0 before:left-1/2 before:w-px before:bg-[var(--ui-border)]">
        <div className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] opacity-50 mb-6">
          Custom Implementation
        </div>
        <div className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] opacity-50 mb-6">
          Using{" "}
          <a href="https://github.com/hashintel/hash/tree/main/libs/%40hashintel/refractive" target="_blank" rel="noreferrer"
            className="text-inherit underline">
            @hashintel/refractive
          </a>
          {" "}<span className="inline-block text-[0.7rem] bg-yellow-500/15 border border-yellow-500/30 text-yellow-600 dark:text-amber-400 px-2.5 py-0.5 rounded-[5px] tracking-[0.02em] normal-case">Chrome only</span>
        </div>

        <CustomSwitchDemo />
        <RefractiveSwitchDemo />

        <CustomSliderDemo />
        <RefractiveSliderDemo />
      </main>
      <footer className="text-center py-5 px-6 text-xs opacity-40 border-t border-[var(--ui-border)]">
        Johann Berger · 2025
      </footer>
    </div>
  );
}
