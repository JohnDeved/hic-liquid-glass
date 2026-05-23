import { PARAM_CONFIG, type useRefractionParams } from '../hooks/useRefractionParams'

type Props = ReturnType<typeof useRefractionParams>

export function Params({ params, set }: Props) {
  return (
    <div className="mt-6 flex flex-col gap-2.5 text-[var(--text-80)]">
      <div className="flex items-center gap-4">
        <div className="uppercase tracking-[0.14em] text-[10px] opacity-70 select-none whitespace-nowrap">
          Parameters
        </div>
        <div className="h-px flex-1 bg-[var(--ui-border)]" />
      </div>
      {PARAM_CONFIG.map(({ key, label, min, max, step }) => {
        const v = params[key]
        let digits = 0
        if (step < 1) digits = 2
        else if (step < 10) digits = 1
        const display = digits === 0 ? String(v) : v.toFixed(digits)
        return (
          <div key={key} className="flex items-center gap-3 sm:gap-4">
            <label className="w-32 sm:w-56 uppercase tracking-[0.08em] text-[11px] opacity-80 select-none leading-tight shrink-0">
              {label}
            </label>
            <span className="w-12 sm:w-14 text-right font-mono tabular-nums text-[11px] text-[var(--text-60)] shrink-0">
              {display}
            </span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={v}
              onChange={e => set(key)(Number(e.target.value))}
              className="flex-1 min-w-0"
              aria-label={label}
            />
          </div>
        )
      })}
    </div>
  )
}
