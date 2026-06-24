"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { SurfaceProfile } from "@/lib/surface";

const TMP = new THREE.Object3D();
// Soft, natural meadow-flower colours.
const FLOWER_COLORS = [
  "#ffffff",
  "#fff4c2",
  "#f6c64b",
  "#e86a7a",
  "#c95b8b",
  "#b07fd8",
  "#8fb8ff",
];

// Scatter on the island top — on the real raycast surface when available.
function scatter(
  radius: number,
  topY: number,
  rng: () => number,
  surface?: SurfaceProfile,
): THREE.Vector3 {
  const R = surface ? Math.min(radius, surface.edgeR * 0.99) : radius;
  const r = R * Math.sqrt(rng());
  const a = rng() * Math.PI * 2;
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const y = surface ? surface.heightAt(r) : topY - Math.pow(r / radius, 2) * 1.6;
  return new THREE.Vector3(x, y, z);
}

// Seeded RNG so the meadow is stable across reloads.
function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Low-poly bushes + small, real-looking flowers scattered over the grass. */
export function Flora({
  radius = 10,
  topY = 6.7,
  surface,
}: {
  radius?: number;
  topY?: number;
  surface?: SurfaceProfile;
}) {
  const bushGeo = useMemo(() => new THREE.IcosahedronGeometry(0.5, 0), []);
  const bushMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#3f6b2c",
        roughness: 1,
        flatShading: true,
      }),
    [],
  );

  // A real-ish flower: 5 petals opening upward (coloured per flower) on a thin
  // green stem (a separate mesh so the stem stays green).
  const bloomGeo = useMemo(() => {
    const petals: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 5; k++) {
      const p = new THREE.PlaneGeometry(0.09, 0.18);
      p.translate(0, 0.09, 0); // base at origin
      p.rotateX(-0.95); // tilt outward/up
      p.rotateY((k / 5) * Math.PI * 2);
      petals.push(p);
    }
    const bloom = mergeAll(petals);
    bloom.translate(0, 0.42, 0); // sit on top of the stem
    return bloom;
  }, []);
  const bloomMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        roughness: 0.7,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const stemGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.012, 0.018, 0.45, 5);
    g.translate(0, 0.225, 0);
    return g;
  }, []);
  const stemMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({ color: "#4f7a36", roughness: 0.9 }),
    [],
  );

  const bushRef = useRef<THREE.InstancedMesh>(null);
  const bloomRef = useRef<THREE.InstancedMesh>(null);
  const stemRef = useRef<THREE.InstancedMesh>(null);
  const BUSHES = 130;
  const FLOWERS = 320;

  useEffect(() => {
    const bush = bushRef.current;
    if (bush) {
      const rng = mulberry(7);
      const col = new THREE.Color();
      for (let i = 0; i < BUSHES; i++) {
        const p = scatter(radius - 0.5, topY, rng, surface);
        TMP.position.copy(p);
        TMP.position.y += 0.2;
        TMP.rotation.set(0, rng() * Math.PI, 0);
        const s = 0.6 + rng() * 0.9;
        TMP.scale.set(s, s * (0.7 + rng() * 0.4), s);
        TMP.updateMatrix();
        bush.setMatrixAt(i, TMP.matrix);
        col.setHSL(0.28 + rng() * 0.05, 0.45, 0.25 + rng() * 0.1);
        bush.setColorAt(i, col);
      }
      bush.instanceMatrix.needsUpdate = true;
      if (bush.instanceColor) bush.instanceColor.needsUpdate = true;
    }

    const bloom = bloomRef.current;
    const stem = stemRef.current;
    if (bloom && stem) {
      const rng = mulberry(99);
      const col = new THREE.Color();
      for (let i = 0; i < FLOWERS; i++) {
        const p = scatter(radius, topY, rng, surface);
        TMP.position.copy(p);
        TMP.rotation.set(0, rng() * Math.PI * 2, 0);
        const s = 0.7 + rng() * 0.5; // small flowers
        TMP.scale.set(s, s, s);
        TMP.updateMatrix();
        bloom.setMatrixAt(i, TMP.matrix);
        stem.setMatrixAt(i, TMP.matrix);
        col.set(FLOWER_COLORS[(rng() * FLOWER_COLORS.length) | 0]);
        bloom.setColorAt(i, col);
      }
      bloom.instanceMatrix.needsUpdate = true;
      stem.instanceMatrix.needsUpdate = true;
      if (bloom.instanceColor) bloom.instanceColor.needsUpdate = true;
    }
  }, [radius, topY, surface]);

  return (
    <group>
      <instancedMesh
        ref={bushRef}
        args={[bushGeo, bushMat, BUSHES]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
      <instancedMesh
        ref={stemRef}
        args={[stemGeo, stemMat, FLOWERS]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={bloomRef}
        args={[bloomGeo, bloomMat, FLOWERS]}
        frustumCulled={false}
      />
    </group>
  );
}

// Merge any number of geometries (positions + uv + index) into one.
function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let acc = geos[0];
  for (let i = 1; i < geos.length; i++) acc = mergeTwo(acc, geos[i]);
  return acc;
}

function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry) {
  const ap = a.getAttribute("position").array as ArrayLike<number>;
  const bp = b.getAttribute("position").array as ArrayLike<number>;
  const positions = new Float32Array(ap.length + bp.length);
  positions.set(ap, 0);
  positions.set(bp, ap.length);
  const ai = a.getIndex()!.array as ArrayLike<number>;
  const bi = b.getIndex()!.array as ArrayLike<number>;
  const offset = ap.length / 3;
  const index: number[] = [];
  for (let i = 0; i < ai.length; i++) index.push(ai[i]);
  for (let i = 0; i < bi.length; i++) index.push(bi[i] + offset);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
