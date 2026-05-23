import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { useTheme } from '../themeContext'

interface DemoShellProps {
  title: string
  description: string
  params?: ReactNode
  touchNone?: boolean
  /** Renders into the bg-styled stage div (= HIC raster source in webgl mode). */
  children: (useImage: boolean) => ReactNode
}

/** Shared layout: chrome container + bg-styled stage carrying `data-glass-stage`
 *  so any `<DisplacementGlass>` inside can find its capture root. */
export function DemoShell({ title, description, params, touchNone, children }: DemoShellProps) {
  const [useImage, setUseImage] = useState(false)
  const { theme } = useTheme()

  return (
    <div className="grid grid-rows-subgrid row-span-4">
      <h2 className="text-lg font-semibold mb-1.5">{title}</h2>
      <p className="text-[0.82rem] opacity-55 mb-3 leading-relaxed">{description}</p>
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
