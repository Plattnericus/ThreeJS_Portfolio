"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { TIER_BUILDING, Tier, tierForIndex } from "@/lib/rarity";
import { MAX_HOUSES } from "@/lib/layout";
import { sampleBranchAnchors } from "@/lib/branches";
import { trimAboveY } from "@/lib/trim";

const PACK = "/models/casual_village_buildings_pack.glb";
const PLATFORM = "/models/weighted_wood_platform.glb";
const TREE = "/models/tree.glb";

// Smaller treehouse-sized buildings; rarer = a bit bigger.
const TIER_SIZE: Record<Tier, number> = {
  common: 0.95,
  uncommon: 1.2,
  rare: 1.5,
  legendary: 1.85,
};

function useBuildingFactory() {
  const { scene } = useGLTF(PACK);
  return useMemo(() => {
    const geos = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material }>();
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh)
        geos.set(o.name, { geo: o.geometry, mat: o.material as THREE.Material });
    });
    return (tier: Tier) => {
      const src = geos.get(TIER_BUILDING[tier]);
      if (!src) return null;
      const mesh = new THREE.Mesh(src.geo.clone(), (src.mat as THREE.Material).clone());
      mesh.castShadow = true;
      mesh.rotation.x = -Math.PI / 2; // Z-up -> Y-up
      mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);
      const s = TIER_SIZE[tier] / Math.max(size.x, size.z);
      const g = new THREE.Group();
      g.add(mesh);
      g.scale.setScalar(s);
      mesh.position.set(-center.x, -box.min.y, -center.z);
      return g;
    };
  }, [scene]);
}

// Flat wooden deck (the hanging weight trimmed off), deck top at y=0.
function usePlatformFactory() {
  const { scene } = useGLTF(PLATFORM);
  return useMemo(() => {
    let srcMesh: THREE.Mesh | null = null;
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh && !srcMesh) srcMesh = o;
    });
    const m = srcMesh as THREE.Mesh | null;
    if (!m) return () => null;
    m.geometry.computeBoundingBox();
    const cut = m.geometry.boundingBox!.max.y - 3.2;
    const deckGeo = trimAboveY(m.geometry, cut);
    const deckMat = (m.material as THREE.Material).clone();
    return (deckW: number) => {
      const mesh = new THREE.Mesh(deckGeo.clone(), deckMat.clone());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const bb = mesh.geometry.boundingBox!;
      const size = new THREE.Vector3();
      bb.getSize(size);
      const s = deckW / Math.max(size.x, size.z);
      mesh.scale.setScalar(s);
      mesh.position.set(
        -((bb.min.x + bb.max.x) / 2) * s,
        -bb.max.y * s, // deck top at y=0
        -((bb.min.z + bb.max.z) / 2) * s,
      );
      return mesh;
    };
  }, [scene]);
}

export function Houses({
  stars,
  wind = 1,
  highlight = -1,
}: {
  stars: number;
  wind?: number;
  highlight?: number;
}) {
  const makeBuilding = useBuildingFactory();
  const makePlatform = usePlatformFactory();
  const { scene: treeScene } = useGLTF(TREE);
  const anchors = useMemo(
    () => sampleBranchAnchors(treeScene, MAX_HOUSES),
    [treeScene],
  );

  const groups = useRef<(THREE.Group | null)[]>([]);
  const active = Math.min(anchors.length, Math.max(0, Math.floor(stars)));

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < anchors.length; i++) {
      const grp = groups.current[i];
      if (!grp) continue;
      const isHi = i === highlight;
      const target = i < active ? (isHi ? 1.15 : 1) : 0;
      grp.scale.x += (target - grp.scale.x) * 0.12;
      grp.scale.y = grp.scale.z = grp.scale.x;
      grp.visible = grp.scale.x > 0.01;
      // tiny settle bob in place (they're rooted to the branch, not floating)
      grp.position.y =
        anchors[i].pos.y + 0.35 + Math.sin(t * 0.8 + i) * (isHi ? 0.12 : 0.03);
    }
  });

  return (
    <group>
      {anchors.map((a, i) => {
        const tier = tierForIndex(i);
        const building = makeBuilding(tier);
        const platform = makePlatform(TIER_SIZE[tier] * 1.5);
        return (
          <group
            key={i}
            ref={(g) => {
              groups.current[i] = g;
            }}
            position={a.pos}
            rotation={[0, i * 1.7, 0]}
            scale={0}
          >
            {platform && <primitive object={platform} />}
            {building && <primitive object={building} position={[0, 0.04, 0]} />}
          </group>
        );
      })}
    </group>
  );
}

useGLTF.preload(PACK);
useGLTF.preload(PLATFORM);
