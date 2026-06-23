"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { MAX_HOUSES } from "@/lib/layout";
import { sampleBranchAnchors } from "@/lib/branches";

const BRIDGE = "/models/suspension_bridge.glb";
const TREE = "/models/tree.glb";
const X_AXIS = new THREE.Vector3(1, 0, 0);

// Suspension bridges deck-to-deck: each active house links to its nearest active
// neighbour (short spans only), using the bridge model stretched along the gap.
export function Bridges({ stars }: { stars: number }) {
  const { scene: bridgeScene } = useGLTF(BRIDGE);
  const { scene: treeScene } = useGLTF(TREE);
  const anchors = useMemo(
    () => sampleBranchAnchors(treeScene, MAX_HOUSES),
    [treeScene],
  );

  // Centered bridge geometry + its length along X.
  const { geo, mat, lenX } = useMemo(() => {
    let m: THREE.Mesh | null = null;
    bridgeScene.traverse((o) => {
      if (o instanceof THREE.Mesh && !m) m = o;
    });
    const mesh = m as THREE.Mesh | null;
    if (!mesh) return { geo: null, mat: null, lenX: 1 };
    const g = mesh.geometry.clone();
    g.computeBoundingBox();
    const c = new THREE.Vector3();
    g.boundingBox!.getCenter(c);
    g.translate(-c.x, -c.y, -c.z); // center at origin
    const size = new THREE.Vector3();
    g.boundingBox!.getSize(size);
    return { geo: g, mat: (mesh.material as THREE.Material).clone(), lenX: size.x };
  }, [bridgeScene]);

  // Build the set of short edges (nearest active neighbour, deduped).
  const active = Math.min(anchors.length, Math.max(0, Math.floor(stars)));
  const edges = useMemo(() => {
    const out: [number, number][] = [];
    const seen = new Set<string>();
    for (let i = 0; i < active; i++) {
      let best = -1;
      let bestD = Infinity;
      for (let j = 0; j < active; j++) {
        if (j === i) continue;
        const d = anchors[i].pos.distanceToSquared(anchors[j].pos);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      if (best < 0 || Math.sqrt(bestD) > 6.5) continue; // short spans only
      const key = `${Math.min(i, best)}-${Math.max(i, best)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([i, best]);
    }
    return out;
  }, [active, anchors]);

  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    edges.forEach(([i, j], k) => {
      const g = refs.current[k];
      if (!g || !geo) return;
      const a = anchors[i].pos;
      const b = anchors[j].pos;
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const dir = b.clone().sub(a);
      const dist = dir.length() || 1;
      dir.normalize();
      g.position.copy(mid);
      g.quaternion.setFromUnitVectors(X_AXIS, dir);
      g.scale.set(dist / lenX, 0.28, 0.32);
    });
  });

  if (!geo || !mat) return null;
  return (
    <group>
      {edges.map(([i, j], k) => (
        <group
          key={`${i}-${j}`}
          ref={(g) => {
            refs.current[k] = g;
          }}
        >
          <mesh geometry={geo} material={mat} castShadow />
        </group>
      ))}
    </group>
  );
}

useGLTF.preload(BRIDGE);
