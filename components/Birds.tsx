"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Merge a list of (indexed) geometries into one (position + recomputed normals).
function mergeMany(geos: THREE.BufferGeometry[]) {
  let acc = geos[0];
  for (let i = 1; i < geos.length; i++) {
    const a = acc;
    const b = geos[i];
    const ap = a.getAttribute("position").array as ArrayLike<number>;
    const bp = b.getAttribute("position").array as ArrayLike<number>;
    const positions = new Float32Array(ap.length + bp.length);
    positions.set(ap, 0);
    positions.set(bp, ap.length);
    const ai = a.getIndex()!.array as ArrayLike<number>;
    const bi = b.getIndex()!.array as ArrayLike<number>;
    const offset = ap.length / 3;
    const index: number[] = [];
    for (let k = 0; k < ai.length; k++) index.push(ai[k]);
    for (let k = 0; k < bi.length; k++) index.push(bi[k] + offset);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    acc = g;
  }
  return acc;
}

// A small, detailed low-poly bird body: streamlined torso + head + beak + tail.
function birdBodyGeometry() {
  const body = new THREE.SphereGeometry(0.16, 10, 8);
  body.scale(0.85, 0.7, 2.0); // elongate forward (+Z)
  const head = new THREE.SphereGeometry(0.12, 10, 8);
  head.translate(0, 0.05, 0.42);
  const beak = new THREE.ConeGeometry(0.045, 0.16, 6);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0.04, 0.6);
  const tail = new THREE.ConeGeometry(0.12, 0.34, 4);
  tail.rotateX(-Math.PI / 2);
  tail.scale(1, 0.3, 1);
  tail.translate(0, 0.02, -0.5);
  return mergeMany([body, head, beak, tail]);
}

// A wing that hinges at the body (extends along ±X), with a little shape.
function wingGeometry(side: 1 | -1) {
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([
    0, 0, 0.18,
    0, 0, -0.22,
    0.42 * side, 0, 0.02,
    0.74 * side, 0, -0.12,
  ]);
  g.setAttribute("position", new THREE.BufferAttribute(v, 3));
  g.setIndex(side === 1 ? [0, 2, 1, 1, 2, 3] : [0, 1, 2, 1, 3, 2]);
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

// A loose flock of detailed low-poly birds circling the island. Wings flap, they
// bank along their orbits, and a few fly lower so the shape reads up close.
export function Birds({ count = 16 }: { count?: number }) {
  const bodyGeo = useMemo(birdBodyGeometry, []);
  const leftGeo = useMemo(() => wingGeometry(-1), []);
  const rightGeo = useMemo(() => wingGeometry(1), []);
  const bodyMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#3a4046", roughness: 1, flatShading: true }),
    [],
  );
  const wingMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#2c3237",
        roughness: 1,
        side: THREE.DoubleSide,
        flatShading: true,
      }),
    [],
  );

  const paths = useMemo<BirdPath[]>(
    () =>
      Array.from({ length: count }, () => ({
        radius: 18 + Math.random() * 30,
        height: 16 + Math.random() * 22,
        speed: 0.12 + Math.random() * 0.14,
        phase: Math.random() * Math.PI * 2,
        flap: 7 + Math.random() * 4,
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
      g.rotation.y = -a + Math.PI / 2;
      g.rotation.z = Math.sin(a) * 0.18;
      const f = Math.sin(t * p.flap + p.phase) * 0.7;
      if (w?.l) w.l.rotation.z = f;
      if (w?.r) w.r.rotation.z = -f;
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
          <mesh geometry={bodyGeo} material={bodyMat} />
          <mesh
            geometry={leftGeo}
            material={wingMat}
            ref={(m) => {
              wings.current[i] = { ...(wings.current[i] || { l: null, r: null }), l: m };
            }}
          />
          <mesh
            geometry={rightGeo}
            material={wingMat}
            ref={(m) => {
              wings.current[i] = { ...(wings.current[i] || { l: null, r: null }), r: m };
            }}
          />
        </group>
      ))}
    </group>
  );
}
