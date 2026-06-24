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
  surface,
}: {
  count?: number;
  radius?: number;
  topY?: number;
  wind?: number;
  surface?: SurfaceProfile;
}) {
  const geom = useMemo(bladeGeometry, []);
  const ref = useRef<THREE.InstancedMesh>(null);
  const uniforms = useRef({ uTime: { value: 0 }, uWind: { value: wind } });

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: "#3f7a2c",
      roughness: 0.95,
      side: THREE.DoubleSide,
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.current.uTime;
      shader.uniforms.uWind = uniforms.current.uWind;
      shader.uniforms.uTip = { value: new THREE.Color("#bfe07a") };
      shader.vertexShader =
        "uniform float uTime;\nuniform float uWind;\nvarying float vH;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           vH = position.y;
           float bend = position.y * position.y;
           vec4 wp = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
           float ph = wp.x * 0.6 + wp.z * 0.5;
           transformed.x += sin(uTime * 1.4 + ph) * bend * 0.30 * uWind;
           transformed.z += cos(uTime * 1.1 + ph) * bend * 0.22 * uWind;`,
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
      color.setHSL(0.25 + rng() * 0.07, 0.5, 0.28 + rng() * 0.16);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [count, radius, topY, surface]);

  useFrame((state) => {
    uniforms.current.uTime.value = state.clock.elapsedTime;
    uniforms.current.uWind.value = 0.6 + wind * 0.8;
  });

  return (
    <instancedMesh
      ref={ref}
      args={[geom, material, count]}
      frustumCulled={false}
    />
  );
}
