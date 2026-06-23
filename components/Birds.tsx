"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// One wing as a thin triangle extending along +Z (mirrored for the other side).
function wingGeometry(mirror: boolean) {
  const z = mirror ? -1 : 1;
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array([0, 0, 0, 0, 0, 0.7 * z, -0.28, 0, 0.34 * z]),
      3,
    ),
  );
  g.computeVertexNormals();
  return g;
}

type BirdPath = {
  radius: number;
  height: number;
  speed: number;
  phase: number;
  flap: number;
  bob: number;
};

// A loose flock of low-poly birds circling high above the island. Wings flap and
// each bird banks along its orbit — distant silhouettes, like real birds.
export function Birds({ count = 16 }: { count?: number }) {
  const leftGeo = useMemo(() => wingGeometry(false), []);
  const rightGeo = useMemo(() => wingGeometry(true), []);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#2a2f33",
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    [],
  );

  const paths = useMemo<BirdPath[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        radius: 26 + Math.random() * 26,
        height: 30 + Math.random() * 18,
        speed: 0.12 + Math.random() * 0.12,
        phase: Math.random() * Math.PI * 2,
        flap: 6 + Math.random() * 4,
        bob: Math.random() * Math.PI * 2,
      })),
    [count],
  );

  const groups = useRef<(THREE.Group | null)[]>([]);
  const wings = useRef<{ l: THREE.Mesh | null; r: THREE.Mesh | null }[]>([]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const g = groups.current[i];
      const w = wings.current[i];
      if (!g) continue;
      const p = paths[i];
      const a = t * p.speed + p.phase;
      g.position.set(
        Math.cos(a) * p.radius,
        p.height + Math.sin(t * 0.6 + p.bob) * 1.5,
        Math.sin(a) * p.radius,
      );
      g.rotation.y = -a + Math.PI / 2; // face direction of travel
      g.rotation.z = Math.sin(a) * 0.15; // gentle bank
      const f = Math.sin(t * p.flap + p.phase) * 0.6;
      if (w?.l) w.l.rotation.x = f;
      if (w?.r) w.r.rotation.x = -f;
    }
  });

  return (
    <group>
      {paths.map((_, i) => (
        <group
          key={i}
          ref={(g) => {
            groups.current[i] = g;
          }}
        >
          <mesh
            geometry={leftGeo}
            material={material}
            ref={(m) => {
              wings.current[i] = { ...(wings.current[i] || {}), l: m };
            }}
          />
          <mesh
            geometry={rightGeo}
            material={material}
            ref={(m) => {
              wings.current[i] = { ...(wings.current[i] || {}), r: m };
            }}
          />
        </group>
      ))}
    </group>
  );
}
