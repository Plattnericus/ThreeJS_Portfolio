"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// A single tapered grass blade (a few verts), pivot at the base so it sways.
function bladeGeometry() {
  const g = new THREE.BufferGeometry();
  const verts = new Float32Array([
    -0.05, 0, 0, 0.05, 0, 0, -0.04, 0.5, 0, 0.04, 0.5, 0, 0, 1, 0,
  ]);
  const idx = [0, 1, 2, 2, 1, 3, 2, 3, 4];
  g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const TMP = new THREE.Object3D();

/**
 * Dense instanced grass over the island plateau, with a wind-sway vertex shader.
 * Blades follow a slight dome and thin out toward the edge.
 */
export function Grass({
  count = 6000,
  radius = 10.5,
  topY = 6.7,
  wind = 1,
}: {
  count?: number;
  radius?: number;
  topY?: number;
  wind?: number;
}) {
  const geom = useMemo(bladeGeometry, []);
  const ref = useRef<THREE.InstancedMesh>(null);
  const uniforms = useRef({ uTime: { value: 0 }, uWind: { value: wind } });

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: "#4f8a32",
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.current.uTime;
      shader.uniforms.uWind = uniforms.current.uWind;
      shader.vertexShader =
        "uniform float uTime;\nuniform float uWind;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           float bend = position.y * position.y;
           vec4 wp = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
           float ph = wp.x * 0.6 + wp.z * 0.5;
           transformed.x += sin(uTime * 1.5 + ph) * bend * 0.25 * uWind;
           transformed.z += cos(uTime * 1.2 + ph) * bend * 0.18 * uWind;`,
        );
    };
    return m;
  }, []);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // disc with thinning toward the edge
      const r = radius * Math.sqrt(Math.random()) * (0.35 + 0.65 * Math.random());
      const a = Math.random() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = topY - Math.pow(r / radius, 2) * 1.6; // follow the dome
      TMP.position.set(x, y, z);
      TMP.rotation.set(0, Math.random() * Math.PI, 0);
      const h = 0.5 + Math.random() * 0.7;
      TMP.scale.set(0.8 + Math.random() * 0.5, h, 1);
      TMP.updateMatrix();
      mesh.setMatrixAt(i, TMP.matrix);
      color.setHSL(0.27 + Math.random() * 0.06, 0.5, 0.32 + Math.random() * 0.12);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [count, radius, topY]);

  useFrame((state) => {
    uniforms.current.uTime.value = state.clock.elapsedTime;
    uniforms.current.uWind.value = wind;
  });

  return (
    <instancedMesh
      ref={ref}
      args={[geom, material, count]}
      castShadow
      receiveShadow
    />
  );
}
