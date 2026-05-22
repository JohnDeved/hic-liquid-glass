import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { useTheme } from "../themeContext";

const OUTER =
  "h-96 rounded-xl border border-[var(--ui-border)] relative overflow-hidden";
const STAGE = "absolute inset-0 flex flex-col items-center justify-center";
const CHECK =
  "absolute bottom-4 z-20 flex items-center gap-1.5 text-xs text-[var(--text-60)] cursor-pointer select-none";

interface DemoShellProps {
  title: string;
  description: string;
  params?: ReactNode;
  touchNone?: boolean;
  /** Children render into the bg-styled stage div. In webgl mode, this is the
   *  HTML-in-Canvas rasterization source. */
  children: (useImage: boolean) => ReactNode;
}

/**
 * Shared layout for every demo. Renders a chrome container with a bg-styled
 * stage. The demo body (children) is identical regardless of backend; the
 * stage carries `data-glass-stage` so any `<DisplacementGlass>` inside can
 * walk up to find its capture root.
 */
export function DemoShell({
  title,
  description,
  params,
  touchNone,
  children,
}: DemoShellProps) {
  const [useImage, setUseImage] = useState(false);
  const { theme } = useTheme();

  return (
    <div className="grid grid-rows-subgrid row-span-4">
      <h2 className="text-lg font-semibold mb-1.5">{title}</h2>
      <p className="text-[0.82rem] opacity-55 mb-3 leading-relaxed">{description}</p>
      <div className={clsx(OUTER, theme === "dark" && "dark", touchNone && "touch-none")}>
        <div
          data-glass-stage="true"
          className={clsx(STAGE, "demo-grid-bg", useImage && "demo-image-bg")}
        >
          {children(useImage)}
        </div>
        <label className={CHECK}>
          <input
            type="checkbox"
            checked={useImage}
            onChange={(e) => setUseImage(e.target.checked)}
            className="accent-indigo-500"
          />
          Use background image
        </label>
      </div>
      {params ?? <div />}
    </div>
  );
}
