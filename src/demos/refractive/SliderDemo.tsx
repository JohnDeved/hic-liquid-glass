import { refractive, convex } from "@hashintel/refractive";
import { useSlider } from "../../hooks/useSlider";
import { useRefractionParams, buildRefraction } from "../../hooks/useRefractionParams";
import { DemoShell } from "../../components/DemoShell";
import { Params } from "../../components/Params";

const SLIDER_DESC =
  "Slider allows you to see the current level through the glass, while the sides refract the background. It uses a convex bezel.";

export function RefractiveSliderDemo() {
  const sl = useSlider();
  const rp = useRefractionParams({ specular: 0.4, refraction: 1.0, blur: 0 });

  return (
    <DemoShell title="Slider" description={SLIDER_DESC} params={<Params {...rp} />}>
      {() => (
        <div {...sl.bind()} className="relative w-[330px] h-[60px] cursor-pointer touch-none" ref={sl.wrapperRef}>
          <div className="absolute left-0 top-[23px] w-[330px] h-[14px] pointer-events-none">
            <div className="w-full h-full bg-[rgb(90,90,93)] rounded-[7px] overflow-hidden shadow-[inset_0_1px_4px_rgba(0,0,0,0.4)]">
              <div
                className="h-full rounded-[6px] bg-[#0377f7] pointer-events-none"
                style={{ width: `${sl.value}%`, transition: sl.fillTransition }}
              />
            </div>
          </div>
          <refractive.div
            className="absolute top-0 w-[90px] h-[60px] ml-[-45px] pointer-events-auto cursor-pointer"
            style={{
              left: `${sl.thumbLeft}px`,
              transform: `scale(${sl.thumbScale})`,
              backgroundColor: sl.thumbBg,
              boxShadow: sl.thumbShadow,
              transition: sl.thumbTransition,
            }}
            refraction={buildRefraction(rp.params, { radius: 30, bezelWidth: 14, bezelHeightFn: convex })}
          />
        </div>
      )}
    </DemoShell>
  );
}
