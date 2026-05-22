import { lip } from "@hashintel/refractive";
import { useSwitch } from "../hooks/useSwitch";
import { useRefractionParams, buildRefraction } from "../hooks/useRefractionParams";
import { DemoShell } from "../components/DemoShell";
import { Params } from "../components/Params";
import { GlassRect } from "../components/GlassRect";

const SWITCH_DESC =
  "A lip bezel: convex on the outside, concave toward the middle. The center stays roughly 1:1 while the edges pull the background in.";

export function SwitchDemo() {
  const sw = useSwitch();
  const rp = useRefractionParams({ specular: 0.5, refraction: 1.0, blur: 0.2 });

  return (
    <DemoShell title="Switch" description={SWITCH_DESC} touchNone params={<Params {...rp} />}>
      {() => (
        <div
          {...sw.bind()}
          className="w-[160px] h-[67px] rounded-[33.5px] relative cursor-pointer touch-none shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)]"
          style={{ backgroundColor: sw.trackColor }}
        >
          <GlassRect
            className="absolute top-[33.5px] left-0 w-[146px] h-[92px] ml-[-21.95px] pointer-events-none"
            style={{
              transform: `translateX(${sw.displayX}px) translateY(-50%) scale(${sw.thumbScale})`,
              backgroundColor: sw.thumbBg,
              boxShadow: sw.thumbShadow,
              transition: sw.thumbTransition,
            }}
            refraction={buildRefraction(rp.params, { radius: 46, bezelWidth: 18, bezelHeightFn: lip })}
          />
        </div>
      )}
    </DemoShell>
  );
}
