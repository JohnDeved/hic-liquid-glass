import { useState, type ReactNode } from "react";
import clsx from "clsx";

const DEMO = "demo-grid-bg h-96 rounded-xl border border-[var(--ui-border)] flex flex-col items-center justify-center relative overflow-hidden";
const CHECK = "absolute bottom-4 flex items-center gap-1.5 text-xs text-[var(--text-60)] cursor-pointer select-none";

interface DemoShellProps {
  title: string;
  description: string;
  params?: ReactNode;
  touchNone?: boolean;
  children: (useImage: boolean) => ReactNode;
}

export function DemoShell({ title, description, params, touchNone, children }: DemoShellProps) {
  const [useImage, setUseImage] = useState(false);

  return (
    <div className="grid grid-rows-subgrid row-span-4">
      <h2 className="text-lg font-semibold mb-1.5">{title}</h2>
      <p className="text-[0.82rem] opacity-55 mb-3 leading-relaxed">{description}</p>
      <div className={clsx(DEMO, touchNone && "touch-none", useImage && "demo-image-bg")}>
        {children(useImage)}
        <label className={CHECK}>
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
  );
}
