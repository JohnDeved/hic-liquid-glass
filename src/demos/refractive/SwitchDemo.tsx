import { refractive, lip } from "@hashintel/refractive";
import { useSwitch } from "../../hooks/useSwitch";
import { useRefractionParams, buildRefraction } from "../../hooks/useRefractionParams";
import { DemoShell } from "../../components/DemoShell";
import { Params } from "../../components/Params";

const SWITCH_DESC =
  "This uses a lip bezel, which makes the surface convex on the outside and concave in the middle. This makes the center slider zoomed out, while the edges refract the inside.";

export function RefractiveSwitchDemo() {
  const sw = useSwitch();
  const rp = useRefractionParams({ specular: 0.5, refraction: 1.0, blur: 0.2 });

  return (
    <DemoShell title="Switch" description={SWITCH_DESC} touchNone params={<Params {...rp} />}>
      {() => (
        <div
          {...sw.bind()}
          className="w-[160px] h-[67px] rounded-[33.5px] relative cursor-pointer transition-colors duration-300 shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)]"
          style={{ backgroundColor: sw.trackColor }}
        >
          <refractive.div
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
