import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { useTheme } from '../themeContext'
import { useGlassBackend } from './GlassBackend'

interface DemoShellProps {
  title: string
  description: string
  params?: ReactNode
  touchNone?: boolean
  /** Renders into the bg-styled stage div (= HIC raster source in webgl mode). */
  children: (useImage: boolean) => ReactNode
}

const BACKEND_LABEL: Record<ReturnType<typeof useGlassBackend>, string> = {
  webgl: 'WebGL + GLSL · HIC',
  refractive: '@hashintel/refractive',
}

const BACKEND_CHIP: Record<ReturnType<typeof useGlassBackend>, string> = {
  webgl: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-400',
  refractive: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-700 dark:text-amber-400',
}

/** Shared layout: chrome container + bg-styled stage carrying `data-glass-stage`
 *  so any `<DisplacementGlass>` inside can find its capture root. */
export function DemoShell({ title, description, params, touchNone, children }: DemoShellProps) {
  const [useImage, setUseImage] = useState(false)
  const { theme } = useTheme()
  const backend = useGlassBackend()

  return (
    <div className="grid grid-rows-subgrid row-span-4">
      <h2 className="text-lg font-semibold mb-1.5 [.is-secondary_&]:hidden lg:[.is-secondary_&]:block">
        {title}
      </h2>
      <p className="text-[0.82rem] opacity-55 mb-3 leading-relaxed [.is-secondary_&]:hidden lg:[.is-secondary_&]:block">
        {description}
      </p>
      <div
        className={clsx(
          'h-72 sm:h-96 rounded-xl border border-[var(--ui-border)] relative overflow-hidden',
          theme === 'dark' && 'dark',
          touchNone && 'touch-none'
        )}
      >
        <div
          data-glass-stage="true"
          className={clsx(
            'absolute inset-0 flex flex-col items-center justify-center demo-grid-bg',
            useImage && 'demo-image-bg',
            '[&>*]:scale-[0.85] sm:[&>*]:scale-100 [&>*]:origin-center'
          )}
        >
          {children(useImage)}
        </div>
        <span
          className={clsx(
            'lg:hidden absolute top-3 left-3 z-20 px-2 py-0.5 rounded-md border text-[10px] uppercase tracking-[0.08em] font-semibold backdrop-blur-sm',
            BACKEND_CHIP[backend]
          )}
        >
          {BACKEND_LABEL[backend]}
        </span>
        <label className="absolute bottom-4 z-20 flex items-center gap-1.5 text-xs text-[var(--text-60)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={useImage}
            onChange={e => setUseImage(e.target.checked)}
            className="accent-indigo-500"
          />
          Use background image
        </label>
      </div>
      {params ?? <div />}
    </div>
  )
}
