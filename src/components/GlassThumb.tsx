import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useFBO } from "@react-three/drei";
import * as THREE from "three";
import vertShader from "../shaders/glass.vert?raw";
import fragShader from "../shaders/glass.frag?raw";

interface GlassThumbProps {
  position: [number, number, number];
  width: number;
  height: number;
  radius: number;
  /** Width of the curved bezel zone in px (default 18 for switch, 14 for slider) */
  bezelWidth?: number;
  /** Virtual glass thickness — controls refraction strength */
  glassThickness?: number;
  /** Index of refraction (default 1.5) */
  ior?: number;
  /** Gaussian blur std-deviation in px */
  blur?: number;
  /** Specular highlight strength 0–1 */
  specularOpacity?: number;
  /** 0=lip, 1=convex, 2=concave, 3=convexCircle */
  bezelType?: number;
  scale?: number;
  /** Optional mutable carrier for scale, read each frame. Takes precedence
   *  over `scale` if provided. Used by WebGLGlassOverlay to track per-frame
   *  CSS scale changes without forcing React re-renders. */
  scaleRef?: { v: number };
  /** Optional mutable carrier for the pill's bg-color (RGBA, 0-1 floats),
   *  read each frame. Composited over the refracted scene in the shader
   *  to mirror CSS backdrop-filter semantics. */
  bgColorRef?: { r: number; g: number; b: number; a: number };
  /**
   * Optional external texture to refract (e.g. an HTMLTexture from the
   * HTML-in-Canvas API). When provided, the FBO scene-capture path is
   * skipped — the shader samples this texture directly in screen-space
   * UVs aligned with the parent canvas viewport.
   */
  sceneTex?: THREE.Texture | null;
}

export function GlassThumb({
  position,
  width,
  height,
  radius,
  bezelWidth = 18,
  glassThickness = 70,
  ior = 1.5,
  blur = 0,
  specularOpacity = 0.5,
  bezelType = 0,
  scale = 1,
  scaleRef,
  bgColorRef,
  sceneTex = null,
}: GlassThumbProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { size, gl } = useThree();

  // FBO is only allocated/used when no external sceneTex is supplied.
  const dpr = gl.getPixelRatio();
  const fbo = useFBO(Math.ceil(size.width * dpr), Math.ceil(size.height * dpr), {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });

  const uniforms = useMemo(
    () => ({
      sceneTex: { value: null as THREE.Texture | null },
      resolution: { value: new THREE.Vector2(size.width, size.height) },
      glassSize: { value: new THREE.Vector2(width, height) },
      thumbPos: { value: new THREE.Vector2(position[0], position[1]) },
      cornerRadius: { value: radius },
      bezelWidth: { value: bezelWidth },
      glassThickness: { value: glassThickness },
      ior: { value: ior },
      blurAmount: { value: blur },
      specularOpacity: { value: specularOpacity },
      bezelType: { value: bezelType },
      bgColor: { value: new THREE.Vector4(1, 1, 1, 1) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Keep sceneTex uniform in sync with the external texture identity, even
  // outside the render loop (e.g. on first paint before useFrame fires).
  useEffect(() => {
    if (sceneTex) uniforms.sceneTex.value = sceneTex;
  }, [sceneTex, uniforms]);

  useFrame(({ gl, scene, camera }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const u = (mesh.material as THREE.ShaderMaterial).uniforms;
    u.thumbPos.value.set(position[0], position[1]);
    u.resolution.value.set(size.width, size.height);
    u.glassSize.value.set(width, height);
    u.cornerRadius.value = radius;
    u.bezelWidth.value = bezelWidth;
    u.glassThickness.value = glassThickness;
    u.bezelType.value = bezelType;
    u.glassThickness.value = glassThickness;
    u.ior.value = ior;
    u.blurAmount.value = blur;
    u.specularOpacity.value = specularOpacity;
    u.bezelType.value = bezelType;
    if (bgColorRef) {
      u.bgColor.value.set(bgColorRef.r, bgColorRef.g, bgColorRef.b, bgColorRef.a);
    }

    if (sceneTex) {
      u.sceneTex.value = sceneTex;
    } else {
      // Fallback: render the scene (minus the glass) into an FBO and use
      // it as the refraction source. Kept for compatibility / non-HIC use.
      mesh.visible = false;
      gl.setRenderTarget(fbo);
      gl.clear();
      gl.render(scene, camera);
      gl.setRenderTarget(null);
      mesh.visible = true;
      u.sceneTex.value = fbo.texture;
    }

    mesh.position.set(position[0], position[1], position[2]);
    mesh.scale.setScalar(scaleRef ? scaleRef.v : scale);
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[width, height]} />
      <shaderMaterial
        vertexShader={vertShader}
        fragmentShader={fragShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}
