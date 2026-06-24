"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { SurfaceProfile } from "@/lib/surface";

const GRASS = "/models/grass.glb";
const TMP = new THREE.Object3D();

// Seeded RNG so the meadow is identical every reload.
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
 * Detailed hand-painted grass tufts (grass.glb, ~216k verts across 4 brush
 * layers, shared material). Each of the 4 layers is its own InstancedMesh that
 * shares the SAME per-tuft transforms, so the layers stay aligned and the whole
 * field is just 4 draw calls. A vertex shader bends the blades in the wind.
 */
export function GrassClumps({
  count = 18,
  radius = 8,
  topY = 5.2,
  wind = 1,
  surface,
}: {
  count?: number;
  radius?: number;
  topY?: number;
  wind?: number;
  surface?: SurfaceProfile;
}) {
  const { scene } = useGLTF(GRASS);
  const uniforms = useRef({ uTime: { value: 0 }, uWind: { value: wind } });

  // Normalise every brush layer to a unit-height tuft with its base at y=0,
  // centred in x/z, and wire the wind-sway shader into each material.
  const parts = useMemo(() => {
    const src = scene.clone(true);
    src.updateMatrixWorld(true);
    const out: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
    const box = new THREE.Box3();
    src.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const g = o.geometry.clone();
        g.applyMatrix4(o.matrixWorld);
        g.computeBoundingBox();
        box.union(g.boundingBox!);
        out.push({ geo: g, mat: (o.material as THREE.Material).clone() });
      }
    });
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const H = size.y || 1;
    out.forEach(({ geo, mat }) => {
      geo.translate(-center.x, -box.min.y, -center.z);
      geo.scale(1 / H, 1 / H, 1 / H);
      const m = mat as THREE.MeshStandardMaterial;
      m.side = THREE.DoubleSide;
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = uniforms.current.uTime;
        shader.uniforms.uWind = uniforms.current.uWind;
        shader.vertexShader =
          "uniform float uTime;\nuniform float uWind;\n" +
          shader.vertexShader.replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
             float sway = max(position.y, 0.0);
             vec4 wp = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
             float ph = wp.x * 0.5 + wp.z * 0.4;
             transformed.x += sin(uTime * 1.3 + ph) * sway * 0.14 * uWind;
             transformed.z += cos(uTime * 1.05 + ph) * sway * 0.10 * uWind;`,
          );
      };
      m.needsUpdate = true;
    });
    return out;
  }, [scene]);

  // Shared per-tuft transforms (dome-following, denser toward mid-field, kept
  // clear of the trunk at the centre).
  const matrices = useMemo(() => {
    const rng = mulberry(1337);
    const arr: THREE.Matrix4[] = [];
    const R = surface ? surface.edgeR * 0.97 : radius;
    for (let i = 0; i < count; i++) {
      const r = 2.2 + (R - 2.2) * Math.sqrt(rng());
      const a = rng() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = surface
        ? surface.heightAt(r) - 0.05
        : topY - Math.pow(r / radius, 2) * 1.6 - 0.05;
      const h = 1.1 + rng() * 1.2;
      const w = 0.95 + rng() * 0.8;
      TMP.position.set(x, y, z);
      TMP.rotation.set(0, rng() * Math.PI * 2, 0);
      TMP.scale.set(w, h, w);
      TMP.updateMatrix();
      arr.push(TMP.matrix.clone());
    }
    return arr;
  }, [count, radius, topY, surface]);

  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  useEffect(() => {
    refs.current.forEach((mesh) => {
      if (!mesh) return;
      matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  }, [matrices, parts]);

  useFrame((state) => {
    uniforms.current.uTime.value = state.clock.elapsedTime;
    uniforms.current.uWind.value = 0.5 + wind * 0.8;
  });

  return (
    <group>
      {parts.map((p, i) => (
        <instancedMesh
          key={i}
          ref={(m) => {
            refs.current[i] = m;
          }}
          args={[p.geo, p.mat, count]}
          castShadow={false}
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

useGLTF.preload(GRASS);
