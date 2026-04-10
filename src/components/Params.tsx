import { PARAM_CONFIG, type useRefractionParams } from "../hooks/useRefractionParams";

type Props = ReturnType<typeof useRefractionParams>;

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
        const v = params[key];
        const display = step < 1 ? v.toFixed(2) : step < 10 ? v.toFixed(1) : String(v);
        return (
          <div key={key} className="flex items-center gap-4">
            <label className="w-56 uppercase tracking-[0.08em] text-[11px] opacity-80 select-none leading-tight shrink-0">
              {label}
            </label>
            <span className="w-14 text-right font-mono tabular-nums text-[11px] text-[var(--text-60)] shrink-0">
              {display}
            </span>
            <input
              type="range" min={min} max={max} step={step} value={v}
              onChange={e => set(key)(Number(e.target.value))}
              className="flex-1"
              aria-label={label}
            />
          </div>
        );
      })}
    </div>
  );
}
