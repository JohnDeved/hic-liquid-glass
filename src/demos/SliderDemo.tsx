import { convex } from '@hashintel/refractive'
import { useSlider } from '../hooks/useSlider'
import { useRefractionParams, buildRefraction } from '../hooks/useRefractionParams'
import { DemoShell } from '../components/DemoShell'
import { Params } from '../components/Params'
import { GlassRect } from '../components/GlassRect'

const SLIDER_DESC =
  'Convex bezel. The center reads the track underneath cleanly so the value stays visible, while the sides refract whatever is behind them.'

export function SliderDemo() {
  const sl = useSlider()
  const rp = useRefractionParams({ specular: 0.4, refraction: 1, blur: 0 })

  return (
    <DemoShell title="Slider" description={SLIDER_DESC} params={<Params {...rp} />}>
      {() => (
        <div
          {...sl.bind()}
          className="relative w-[330px] h-[60px] cursor-pointer touch-none"
          ref={sl.wrapperRef}
        >
          <div className="absolute left-0 top-[23px] w-[330px] h-[14px] pointer-events-none">
            <div className="w-full h-full bg-[rgb(90,90,93)] rounded-[7px] overflow-hidden shadow-[inset_0_1px_4px_rgba(0,0,0,0.4)]">
              <div
                className="h-full rounded-[6px] bg-[#0377f7] pointer-events-none"
                style={{ width: `${sl.fillPct}%` }}
              />
            </div>
          </div>
          <GlassRect
            className="absolute top-0 w-[90px] h-[60px] ml-[-45px] pointer-events-auto cursor-pointer"
            style={{
              left: `${sl.thumbLeft}px`,
              transform: `scale(${sl.thumbScale})`,
              backgroundColor: sl.thumbBg,
              boxShadow: sl.thumbShadow,
              transition: sl.thumbTransition,
            }}
            refraction={buildRefraction(rp.params, {
              radius: 30,
              bezelWidth: 14,
              bezelHeightFn: convex,
            })}
          />
        </div>
      )}
    </DemoShell>
  )
}
