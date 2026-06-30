"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { leafCount } from "@/lib/growth";

const MAX_LEAVES = 40; // plenty of headroom; we expect ~10 stars
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

// A simple low-poly leaf silhouette (teardrop), kept in the tree's local space.
function makeLeafGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.5, 0.3, 0.45, 1.1, 0, 1.4);
  s.bezierCurveTo(-0.45, 1.1, -0.5, 0.3, 0, 0);
  const geo = new THREE.ShapeGeometry(s, 6);
  geo.center();
  geo.scale(2.2, 2.2, 2.2); // readable against the wide canopy
  return geo;
}

type LeafSlot = {
  pos: THREE.Vector3;
  rot: THREE.Euler;
  phase: number;
};

/**
 * One real leaf per star (NOT clusters). Earliest stars ("founders") sit highest
 * in the canopy; each new star pops a leaf in with a little scale spring + sway.
 * Rendered inside the tree group so it scales with growth.
 */
export function Leaves({
  stars,
  wind = 1,
  windVec = [1, 0],
  leafColor = "#6fae4f",
  snow = 0,
}: {
  stars: number;
  wind?: number;
  windVec?: [number, number];
  leafColor?: string;
  snow?: number;
}) {
  const geometry = useMemo(makeLeafGeometry, []);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#6fae4f",
        roughness: 0.7,
        side: THREE.DoubleSide,
      }),
    [],
  );

  // Seasonal tint, frosted toward white as snow accumulates.
  useEffect(() => {
    material.color.set(leafColor).lerp(new THREE.Color("#ffffff"), snow * 0.55);
  }, [material, leafColor, snow]);

  // Deterministic canopy placement: golden-angle spiral over the wide bare
  // canopy, founders highest. Leaves sit out near the branch tips so each one
  // reads clearly against the branches.
  const slots = useMemo<LeafSlot[]>(() => {
    const out: LeafSlot[] = [];
    const top = 9.6;
    const bottom = 6.0;
    for (let i = 0; i < MAX_LEAVES; i++) {
      const t = i / (MAX_LEAVES - 1);
      const y = THREE.MathUtils.lerp(top, bottom, t);
      const radius = 3.0 + 3.5 * Math.sin(t * Math.PI); // out toward branch tips
      const angle = i * GOLDEN;
      const pos = new THREE.Vector3(
        Math.cos(angle) * radius,
        y,
        Math.sin(angle) * radius,
      );
      // Face the leaf outward and give it a natural droop.
      const rot = new THREE.Euler(
        Math.random() * 0.5 - 0.25,
        -angle,
        Math.random() * 0.5 - 0.25,
      );
      out.push({ pos, rot, phase: Math.random() * Math.PI * 2 });
    }
    return out;
  }, []);

  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const active = leafCount(stars);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < MAX_LEAVES; i++) {
      const mesh = refs.current[i];
      if (!mesh) continue;
      const target = i < active ? 1 : 0;
      // ease scale toward target (pop-in / pop-out)
      mesh.scale.x += (target - mesh.scale.x) * 0.12;
      mesh.scale.y = mesh.scale.z = mesh.scale.x;
      // wind sway scales with the live wind value
      const sway = Math.sin(t * (1.0 + wind * 0.6) + slots[i].phase) * 0.1 * wind;
      mesh.position.x = slots[i].pos.x + windVec[0] * sway * 0.6;
      mesh.position.z = slots[i].pos.z + windVec[1] * sway * 0.6;
      mesh.rotation.z = slots[i].rot.z + sway * (windVec[0] || 1);
      mesh.rotation.x = slots[i].rot.x + sway * windVec[1] * 0.35;
    }
  });

  return (
    <group>
      {slots.map((slot, i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m;
          }}
          geometry={geometry}
          material={material}
          position={slot.pos}
          rotation={slot.rot}
          scale={0}
          castShadow
        />
      ))}
    </group>
  );
}
