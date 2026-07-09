"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SurfaceProfile } from "@/lib/surface";
import { AERIAL_FRAG, CLOUD_SHADOW_FRAG } from "@/lib/shaderChunks";

// A slim, tapered, slightly curved grass blade (pivot at the base so it sways).
function bladeGeometry() {
  const g = new THREE.BufferGeometry();
  // 3 segments → a gentle natural curve; tapers to a point at the tip.
  const verts = new Float32Array([
    -0.045, 0.0, 0.0, 0.045, 0.0, 0.0,
    -0.038, 0.34, 0.02, 0.038, 0.34, 0.02,
    -0.026, 0.68, 0.06, 0.026, 0.68, 0.06,
    0.0, 1.0, 0.12,
  ]);
  const idx = [0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6];
  g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const TMP = new THREE.Object3D();

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Dense, tall instanced grass carpeting the island plateau, with a wind-sway
 * vertex shader and a sunlit tip gradient. One draw call.
 */
export function Grass({
  count = 55000,
  radius = 9.5,
  topY = 6.7,
  wind = 1,
  gust = 0,
  windVec = [1, 0],
  cloudCover = 0,
  surface,
  aerial = 0,
  hazeColor = "#a8c4de",
}: {
  count?: number;
  radius?: number;
  topY?: number;
  wind?: number;
  gust?: number;
  windVec?: [number, number];
  cloudCover?: number;
  surface?: SurfaceProfile;
  aerial?: number;
  hazeColor?: string;
}) {
  const geom = useMemo(bladeGeometry, []);
  const ref = useRef<THREE.InstancedMesh>(null);
  const uniforms = useRef({
    uTime: { value: 0 },
    uWind: { value: wind },
    uWindDir: { value: new THREE.Vector2(windVec[0], windVec[1]) },
    uCloudCover: { value: cloudCover },
    uAerial: { value: aerial },
    uHazeColor: { value: new THREE.Color(hazeColor) },
  });

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: "#355f27",
      roughness: 0.95,
      side: THREE.DoubleSide,
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.current.uTime;
      shader.uniforms.uWind = uniforms.current.uWind;
      shader.uniforms.uWindDir = uniforms.current.uWindDir;
      shader.uniforms.uCloudCover = uniforms.current.uCloudCover;
      shader.uniforms.uAerial = uniforms.current.uAerial;
      shader.uniforms.uHazeColor = uniforms.current.uHazeColor;
      shader.uniforms.uTip = { value: new THREE.Color("#a9c96d") };
      // A single mid field-green distant blades fade toward (between base
      // #355f27 and tip) so the far carpet is smooth, not shimmering.
      shader.uniforms.uField = { value: new THREE.Color("#4d7636") };
      shader.vertexShader =
        "uniform float uTime;\nuniform float uWind;\nuniform vec2 uWindDir;\nattribute float aPhase;\nattribute float aSpeed;\nvarying float vH;\nvarying float vDist;\nvarying vec3 vWPos;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           vH = position.y;
           float bend = position.y * position.y;
           vec2 dir = normalize(uWindDir);
           vec2 side = vec2(-dir.y, dir.x);
           vec4 root = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
           // every blade sways on its OWN phase + speed → individual, smooth
           // motion with no marching wave. Downwind bend is directional; side
           // flutter is the small turbulence real grass gets in gusts.
           float stream = dot(root.xz, dir) * 0.34;
           float t = uTime * aSpeed + aPhase - stream;
           float gust = 0.74 + 0.22 * sin(uTime * 0.48 + aPhase * 1.7) + 0.08 * sin(uTime * 1.7 + stream);
           float downwind = bend * (0.18 + sin(t) * 0.08) * uWind * gust;
           float lateral = bend * sin(t * 1.7 + aPhase) * 0.055 * uWind;
           transformed.x += dir.x * downwind + side.x * lateral;
           transformed.z += dir.y * downwind + side.y * lateral;
           // Blades are sized to read well from the far-away orbit camera —
           // at first-person (walk-mode) eye height they'd tower into the
           // near clip plane and blind the view. Shrink each blade toward
           // its own root as the CAMERA gets close (orbit is always far
           // enough that this never engages); purely local-space, so it
           // can't affect the world-space wind sway already applied above.
           float distToCam = length(root.xz - cameraPosition.xz);
           float nearShrink = smoothstep(1.3, 6.5, distToCam);
           transformed *= nearShrink;
           vDist = distToCam;
           vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`,
        );
      shader.fragmentShader =
        "uniform vec3 uTip;\nuniform vec3 uField;\nuniform float uTime;\nuniform vec2 uWindDir;\nuniform float uCloudCover;\nuniform float uAerial;\nuniform vec3 uHazeColor;\nvarying float vH;\nvarying float vDist;\nvarying vec3 vWPos;\n" +
        shader.fragmentShader.replace(
          "#include <color_fragment>",
          `#include <color_fragment>
           // Distance anti-shimmer: thin blades go sub-pixel far away, and the
           // bright tip vs. dark base contrast makes them ALIAS (the "grass is
           // pixelated von weitem" the eye catches as a crawling carpet). Fade
           // the tip-gradient contrast out AND blend toward one flat field
           // green as blades recede, so the far field reads as smooth grass
           // instead of a shimmering high-contrast mess. Near/mid blades (where
           // detail is actually resolvable) are untouched.
           float farFade = smoothstep(26.0, 52.0, vDist);
           float tipAmt = smoothstep(0.15, 1.0, vH) * 0.6 * (1.0 - farFade * 0.8);
           diffuseColor.rgb = mix(diffuseColor.rgb, uTip, tipAmt);
           diffuseColor.rgb = mix(diffuseColor.rgb, uField, farFade * 0.55);
           ${CLOUD_SHADOW_FRAG}
           ${AERIAL_FRAG}`,
        );
    };
    return m;
  }, []);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const rng = mulberry(424242);
    const color = new THREE.Color();
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);
    const R = surface ? surface.edgeR * 0.99 : radius;
    for (let i = 0; i < count; i++) {
      // uniform disc fill so the whole plateau is covered edge to edge
      const r = R * Math.sqrt(rng());
      const a = rng() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // sit on the REAL island surface (raycast profile), base tucked in the soil
      const y = surface
        ? surface.heightAt(r) - 0.25
        : topY - Math.pow(r / radius, 2) * 1.6 - 0.15;
      TMP.position.set(x, y, z);
      // random yaw + a gentle natural lean
      TMP.rotation.set((rng() - 0.5) * 0.35, rng() * Math.PI * 2, (rng() - 0.5) * 0.35);
      const h = 0.95 + rng() * 1.15;
      const w = 0.95 + rng() * 0.8;
      TMP.scale.set(w, h, w);
      TMP.updateMatrix();
      mesh.setMatrixAt(i, TMP.matrix);
      color.setHSL(0.25 + rng() * 0.07, 0.42, 0.2 + rng() * 0.16);
      mesh.setColorAt(i, color);
      phases[i] = rng() * Math.PI * 2; // unique phase per blade
      speeds[i] = 0.8 + rng() * 1.5; // unique speed per blade
    }
    geom.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));
    geom.setAttribute("aSpeed", new THREE.InstancedBufferAttribute(speeds, 1));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [count, radius, topY, surface, geom]);

  useFrame((state) => {
    uniforms.current.uTime.value = state.clock.elapsedTime;
    uniforms.current.uWind.value = 0.5 + wind * 0.75 + gust * 0.18;
    uniforms.current.uWindDir.value.set(windVec[0], windVec[1]).normalize();
    uniforms.current.uCloudCover.value = cloudCover;
    uniforms.current.uAerial.value = aerial;
    uniforms.current.uHazeColor.value.set(hazeColor);
  });

  return (
    <instancedMesh ref={ref} args={[geom, material, count]} />
  );
}
