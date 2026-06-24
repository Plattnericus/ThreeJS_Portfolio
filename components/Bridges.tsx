"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { MAX_HOUSES } from "@/lib/layout";
import { sampleBranchAnchors } from "@/lib/branches";
import { buildLantern } from "@/lib/lantern";
import { Tier, tierForIndex } from "@/lib/rarity";

const BRIDGE = "/models/suspension_bridge.glb";
const TREE = "/models/tree.glb";
const LANTERN = "/models/stylized_lantern.glb";
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const DECK = 0.35; // platform deck top above the raw branch anchor (matches Houses)
const TRUNK_R = 1.8; // keep spans from cutting through the central trunk
const LADDER_DH = 1.2; // height gap above this → ladder, not a bridge
const LADDER_W = 0.85;
const LADDER_CROSS = 0.46; // built ladder's widest extent (for cross-scaling)

// A simple, sturdy wooden ladder built in code: two rails + rungs, height 1,
// centred at the origin with its long axis on Y (so it can be stretched to span
// any climb). No external asset needed.
const LADDER_WOOD = new THREE.MeshStandardMaterial({
  color: "#7a5230",
  roughness: 0.85,
  flatShading: true,
});
function makeLadder(): THREE.Group {
  const g = new THREE.Group();
  const railGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 6); // y: -0.5..0.5
  for (const x of [-0.2, 0.2]) {
    const rail = new THREE.Mesh(railGeo, LADDER_WOOD);
    rail.position.x = x;
    rail.castShadow = true;
    g.add(rail);
  }
  const rungGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.46, 6);
  const N = 7;
  for (let i = 0; i < N; i++) {
    const rung = new THREE.Mesh(rungGeo, LADDER_WOOD);
    rung.rotation.z = Math.PI / 2;
    rung.position.y = -0.42 + (i / (N - 1)) * 0.84;
    rung.castShadow = true;
    g.add(rung);
  }
  return g;
}

const TIER_SIZE: Record<Tier, number> = {
  common: 0.95,
  uncommon: 1.2,
  rare: 1.5,
  legendary: 1.85,
};
const deckRadius = (i: number) => TIER_SIZE[tierForIndex(i)] * 1.5;

// Closest distance (XZ) from the trunk (origin) to segment a→b.
function segDistToTrunkXZ(a: THREE.Vector3, b: THREE.Vector3): number {
  const ax = a.x;
  const az = a.z;
  const bx = b.x - ax;
  const bz = b.z - az;
  const len2 = bx * bx + bz * bz || 1;
  let t = -(ax * bx + az * bz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + bx * t, az + bz * t);
}

type Model = {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  len: number;
  axis: THREE.Vector3;
  cross: number;
};

function extractModel(scene: THREE.Object3D): Model | null {
  let mesh: THREE.Mesh | null = null;
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh && !mesh) mesh = o;
  });
  const m = mesh as THREE.Mesh | null;
  if (!m) return null;
  const g = m.geometry.clone();
  g.computeBoundingBox();
  const c = new THREE.Vector3();
  g.boundingBox!.getCenter(c);
  g.translate(-c.x, -c.y, -c.z);
  const size = new THREE.Vector3();
  g.boundingBox!.getSize(size);
  let axis = new THREE.Vector3(1, 0, 0);
  let len = size.x;
  let cross = Math.max(size.y, size.z);
  if (size.y >= size.x && size.y >= size.z) {
    axis = new THREE.Vector3(0, 1, 0);
    len = size.y;
    cross = Math.max(size.x, size.z);
  } else if (size.z >= size.x && size.z >= size.y) {
    axis = new THREE.Vector3(0, 0, 1);
    len = size.z;
    cross = Math.max(size.x, size.y);
  }
  return { geo: g, mat: (m.material as THREE.Material).clone(), len, axis, cross };
}

// Platform-to-platform walkways: a minimum spanning tree connects every deck.
// Gentle gaps → a suspension bridge (rim-to-rim, with a hanging sag); steep
// climbs → a ladder; overlapping decks need nothing. Each span carries a lantern.
export function Bridges({ stars, night = 0 }: { stars: number; night?: number }) {
  const { scene: bridgeScene } = useGLTF(BRIDGE);
  const { scene: treeScene } = useGLTF(TREE);
  const { scene: lanternScene } = useGLTF(LANTERN);
  const anchors = useMemo(
    () => sampleBranchAnchors(treeScene, MAX_HOUSES),
    [treeScene],
  );
  const bridge = useMemo(() => extractModel(bridgeScene), [bridgeScene]);
  // Procedural ladder: unit height, long axis Y. (len/axis/cross drive scaling.)
  const ladder = { len: 1, axis: Y_AXIS, cross: LADDER_CROSS };

  const active = Math.min(anchors.length, Math.max(0, Math.floor(stars)));

  const edges = useMemo<[number, number, boolean][]>(() => {
    const out: [number, number, boolean][] = [];
    if (active < 2) return out;
    const cost = (i: number, j: number) => {
      const a = anchors[i].pos;
      const b = anchors[j].pos;
      const hd = Math.hypot(b.x - a.x, b.z - a.z);
      const gap = Math.max(0, hd - deckRadius(i) - deckRadius(j));
      const dh = Math.abs(a.y - b.y);
      const pen = segDistToTrunkXZ(a, b) < TRUNK_R ? 8 : 1;
      return (gap + dh * 1.5) * pen;
    };
    const inTree = new Array(active).fill(false);
    const best = new Array(active).fill(Infinity);
    const parent = new Array(active).fill(0);
    inTree[0] = true;
    for (let j = 1; j < active; j++) best[j] = cost(0, j);
    for (let k = 1; k < active; k++) {
      let pick = -1;
      let pickD = Infinity;
      for (let j = 0; j < active; j++) {
        if (!inTree[j] && best[j] < pickD) {
          pickD = best[j];
          pick = j;
        }
      }
      if (pick < 0) break;
      inTree[pick] = true;
      const pa = anchors[parent[pick]].pos;
      const pb = anchors[pick].pos;
      const dh = Math.abs(pa.y - pb.y);
      const hd = Math.hypot(pb.x - pa.x, pb.z - pa.z);
      const gap = Math.max(0, hd - deckRadius(parent[pick]) - deckRadius(pick));
      // ladder ONLY for steep, near-stacked climbs (rise clearly beats the run),
      // so ladders stand upright instead of lying across a long gap.
      const isLadder = dh > LADDER_DH && dh > gap * 1.3;
      out.push([parent[pick], pick, isLadder]);
      for (let j = 0; j < active; j++) {
        if (inTree[j]) continue;
        const d = cost(pick, j);
        if (d < best[j]) {
          best[j] = d;
          parent[j] = pick;
        }
      }
    }
    return out;
  }, [active, anchors]);

  const refs = useRef<(THREE.Group | null)[]>([]);
  const lanternRefs = useRef<(THREE.Group | null)[]>([]);
  const a3 = useMemo(() => new THREE.Vector3(), []);
  const b3 = useMemo(() => new THREE.Vector3(), []);
  const mid = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const dirH = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    edges.forEach(([i, j, isLadder], k) => {
      const g = refs.current[k];
      const lg = lanternRefs.current[k];
      if (!g) return;

      if (isLadder && ladder) {
        const lo = anchors[i].pos.y <= anchors[j].pos.y ? i : j;
        const hi = lo === i ? j : i;
        const loP = anchors[lo].pos;
        const hiP = anchors[hi].pos;
        dirH.set(hiP.x - loP.x, 0, hiP.z - loP.z);
        const hd = dirH.length() || 1;
        dirH.normalize();
        const sep = hd - deckRadius(lo) - deckRadius(hi);
        a3.set(loP.x + dirH.x * deckRadius(lo), loP.y + DECK, loP.z + dirH.z * deckRadius(lo));
        if (sep > 0.2) {
          b3.set(hiP.x - dirH.x * deckRadius(hi), hiP.y + DECK, hiP.z - dirH.z * deckRadius(hi));
        } else {
          b3.set(a3.x + dirH.x * 0.3, hiP.y + DECK, a3.z + dirH.z * 0.3);
        }
        mid.copy(a3).add(b3).multiplyScalar(0.5);
        dir.copy(b3).sub(a3);
        const dist = dir.length() || 1;
        dir.normalize();
        g.visible = true;
        g.position.copy(mid);
        g.quaternion.setFromUnitVectors(ladder.axis, dir);
        const L = dist / ladder.len;
        const C = LADDER_W / ladder.cross;
        g.scale.set(ladder.axis.x ? L : C, ladder.axis.y ? L : C, ladder.axis.z ? L : C);
        if (lg) {
          lg.visible = true;
          lg.position.set(b3.x, b3.y + 0.16 + Math.sin(t * 0.8 + k) * 0.015, b3.z);
        }
        return;
      }

      if (!bridge) return;
      a3.copy(anchors[i].pos);
      a3.y += DECK;
      b3.copy(anchors[j].pos);
      b3.y += DECK;
      const hd = Math.hypot(b3.x - a3.x, b3.z - a3.z);
      const inset = deckRadius(i) + deckRadius(j);
      if (hd <= inset + 0.4) {
        g.visible = false;
        if (lg) lg.visible = false;
        return;
      }
      g.visible = true;
      if (lg) lg.visible = true;
      dirH.set(b3.x - a3.x, 0, b3.z - a3.z).normalize();
      a3.addScaledVector(dirH, deckRadius(i));
      b3.addScaledVector(dirH, -deckRadius(j));
      mid.copy(a3).add(b3).multiplyScalar(0.5);
      dir.copy(b3).sub(a3);
      const dist = dir.length() || 1;
      dir.normalize();
      const sag = Math.min(0.6, dist * 0.08);
      g.position.copy(mid);
      g.position.y -= sag;
      g.quaternion.setFromUnitVectors(X_AXIS, dir);
      // a touch chunkier so the suspension bridges read clearly
      g.scale.set(dist / bridge.len, 0.42, 0.5);
      if (lg) {
        lg.position.copy(mid);
        lg.position.y += 0.22 - sag + Math.sin(t * 0.8 + k) * 0.015;
      }
    });
  });

  const lightsOn = night > 0.04;
  if (!bridge) return null;
  return (
    <group>
      {edges.map(([i, j, isLadder], k) => {
        const lantern = buildLantern(lanternScene, 0.5, 0, 0.2 + night * 2.2);
        return (
          <group key={`${i}-${j}`}>
            <group
              ref={(g) => {
                refs.current[k] = g;
              }}
            >
              {isLadder ? (
                <primitive object={makeLadder()} />
              ) : (
                <mesh geometry={bridge.geo} material={bridge.mat} castShadow />
              )}
            </group>
            <group
              ref={(g) => {
                lanternRefs.current[k] = g;
              }}
            >
              <primitive object={lantern} />
              {lightsOn && k < 8 && (
                <pointLight
                  color="#ffb765"
                  position={[0, 0.4, 0]}
                  intensity={4 * night}
                  distance={3}
                  decay={2}
                />
              )}
            </group>
          </group>
        );
      })}
    </group>
  );
}

useGLTF.preload(BRIDGE);
useGLTF.preload(LANTERN);
