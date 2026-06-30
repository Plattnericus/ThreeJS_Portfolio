"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SurfaceProfile } from "@/lib/surface";

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
  surface,
}: {
  count?: number;
  radius?: number;
  topY?: number;
  wind?: number;
  gust?: number;
  windVec?: [number, number];
  surface?: SurfaceProfile;
}) {
  const geom = useMemo(bladeGeometry, []);
  const ref = useRef<THREE.InstancedMesh>(null);
  const uniforms = useRef({
    uTime: { value: 0 },
    uWind: { value: wind },
    uWindDir: { value: new THREE.Vector2(windVec[0], windVec[1]) },
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
      shader.uniforms.uTip = { value: new THREE.Color("#8fae5c") };
      shader.vertexShader =
        "uniform float uTime;\nuniform float uWind;\nuniform vec2 uWindDir;\nattribute float aPhase;\nattribute float aSpeed;\nvarying float vH;\n" +
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
           transformed.z += dir.y * downwind + side.y * lateral;`,
        );
      shader.fragmentShader =
        "uniform vec3 uTip;\nvarying float vH;\n" +
        shader.fragmentShader.replace(
          "#include <color_fragment>",
          `#include <color_fragment>
           diffuseColor.rgb = mix(diffuseColor.rgb, uTip, smoothstep(0.15, 1.0, vH) * 0.6);`,
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
      const h = 0.85 + rng() * 1.0; // slightly shorter grass
      const w = 1.0 + rng() * 0.7;
      TMP.scale.set(w, h, w);
      TMP.updateMatrix();
      mesh.setMatrixAt(i, TMP.matrix);
      color.setHSL(0.24 + rng() * 0.06, 0.38, 0.22 + rng() * 0.14);
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
  });

  return (
    <instancedMesh
      ref={ref}
      args={[geom, material, count]}
      frustumCulled={false}
    />
  );
}
