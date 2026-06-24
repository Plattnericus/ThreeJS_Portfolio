"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import gsap from "gsap";
import { TIER_BUILDING, Tier, tierForIndex } from "@/lib/rarity";
import { MAX_HOUSES } from "@/lib/layout";
import { sampleBranchAnchors, type Anchor } from "@/lib/branches";
import { buildLantern } from "@/lib/lantern";
import { nameForIndex } from "@/lib/names";
import type { Stargazer } from "@/lib/stargazers";

const PACK = "/models/casual_village_buildings_pack.glb";
const TREE = "/models/tree.glb";
const LANTERN = "/models/stylized_lantern.glb";
const LANTERN_ROT = 0; // model is already Y-up; no rotation keeps it standing

function rand(seed: number) {
  const x = Math.sin(seed * 53.17 + 11.3) * 43758.5453;
  return x - Math.floor(x);
}

// Clean round wooden platform with a little railing (the supplied platform model
// is a tall weighted contraption, not a flat deck, so we build one). Deck top at
// y=0 so the house sits on it.
const WOOD = new THREE.MeshStandardMaterial({
  color: "#7a5230",
  roughness: 0.85,
  flatShading: true,
});
const WOOD_DARK = new THREE.MeshStandardMaterial({
  color: "#553820",
  roughness: 0.9,
});

function makePlatform(deckR: number): THREE.Group {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(
    new THREE.CylinderGeometry(deckR, deckR * 0.9, 0.28, 20),
    WOOD,
  );
  deck.position.y = -0.14;
  deck.castShadow = true;
  deck.receiveShadow = true;
  g.add(deck);

  const rail = new THREE.Mesh(
    new THREE.TorusGeometry(deckR * 0.97, 0.045, 6, 22),
    WOOD_DARK,
  );
  rail.rotation.x = Math.PI / 2;
  rail.position.y = 0.5;
  g.add(rail);

  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.55, 5),
      WOOD_DARK,
    );
    post.position.set(
      Math.cos(a) * deckR * 0.95,
      0.25,
      Math.sin(a) * deckR * 0.95,
    );
    g.add(post);
  }
  return g;
}

// Smaller treehouse-sized buildings; rarer = a bit bigger.
const TIER_SIZE: Record<Tier, number> = {
  common: 0.95,
  uncommon: 1.2,
  rare: 1.5,
  legendary: 1.85,
};

type BuildFn = (tier: Tier) => THREE.Group | null;

function useBuildingFactory(): BuildFn {
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

// One house: stable geometry (built once), with a GSAP hover glow + scale pop
// and a floating name label. Hover state is local so only this house re-renders.
function House({
  i,
  anchor,
  active,
  night,
  name,
  makeBuilding,
  lanternScene,
  onSelect,
  setRef,
}: {
  i: number;
  anchor: Anchor;
  active: boolean;
  night: number;
  name: string;
  makeBuilding: BuildFn;
  lanternScene: THREE.Object3D;
  onSelect?: (i: number) => void;
  setRef: (i: number, g: THREE.Group | null) => void;
}) {
  const tier = tierForIndex(i);
  const size = TIER_SIZE[tier];
  const [hovered, setHovered] = useState(false);
  const innerRef = useRef<THREE.Group>(null);

  // Built once and reused — hover re-renders don't rebuild the meshes.
  const built = useMemo(() => {
    const building = makeBuilding(tier);
    const deckR = size * 1.5;
    const platform = makePlatform(deckR);
    // Collect the building's own (cloned) materials so we can brighten just this
    // house on hover — the shared platform wood is left untouched.
    const mats: THREE.MeshStandardMaterial[] = [];
    building?.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.MeshStandardMaterial;
        if (m && "emissiveIntensity" in m) {
          m.emissive = new THREE.Color("#fff0d6");
          m.emissiveIntensity = 0;
          mats.push(m);
        }
      }
    });
    const la = rand(i) * Math.PI * 2;
    const lr = deckR * (0.45 + 0.32 * rand(i + 5));
    return { building, platform, deckR, mats, la, lr };
  }, [tier, size, makeBuilding, i]);

  // Lantern glow tracks day/night.
  const lantern = useMemo(
    () => buildLantern(lanternScene, size * 0.8, LANTERN_ROT, 0.2 + night * 2.2),
    [lanternScene, size, night],
  );

  // Hover → brighten (emissive) + a subtle scale pop, eased with GSAP.
  useEffect(() => {
    const glow = { v: built.mats[0]?.emissiveIntensity ?? 0 };
    const t1 = gsap.to(glow, {
      v: hovered ? 0.45 : 0,
      duration: 0.3,
      ease: "power2.out",
      onUpdate: () => built.mats.forEach((m) => (m.emissiveIntensity = glow.v)),
    });
    let t2: gsap.core.Tween | undefined;
    if (innerRef.current) {
      const s = hovered ? 1.06 : 1;
      t2 = gsap.to(innerRef.current.scale, {
        x: s,
        y: s,
        z: s,
        duration: 0.3,
        ease: "power2.out",
      });
    }
    return () => {
      t1.kill();
      t2?.kill();
    };
  }, [hovered, built]);

  const lightsOn = night > 0.04;
  return (
    <group
      ref={(g) => setRef(i, g)}
      position={anchor.pos}
      rotation={[0, i * 1.7, 0]}
      scale={0}
      onClick={(e) => {
        if (!active) return;
        e.stopPropagation();
        onSelect?.(i);
      }}
      onPointerOver={(e) => {
        if (!active) return;
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHovered(false);
        document.body.style.cursor = "auto";
      }}
    >
      <group ref={innerRef}>
        {built.platform && <primitive object={built.platform} />}
        {built.building && <primitive object={built.building} position={[0, 0.04, 0]} />}
        <group position={[Math.cos(built.la) * built.lr, 0.04, Math.sin(built.la) * built.lr]}>
          <primitive object={lantern} />
          {active && lightsOn && i < 10 && (
            <pointLight
              color="#ffb765"
              position={[0, size * 0.45, 0]}
              intensity={5 * night}
              distance={size * 4}
              decay={2}
            />
          )}
        </group>
        {active && lightsOn && i < 8 && (
          <pointLight
            color="#ffc27a"
            position={[0, size * 0.55, 0]}
            intensity={7 * night}
            distance={size * 3.5}
            decay={2}
          />
        )}
      </group>

      {hovered && active && (
        <Html
          position={[0, size * 1.7 + 1.05, 0]}
          center
          distanceFactor={9}
          zIndexRange={[20, 0]}
          pointerEvents="none"
          wrapperClass="select-none"
        >
          <div className="anim-fade pointer-events-none whitespace-nowrap rounded-full border border-white/15 bg-[#0d141d]/90 px-3 py-1 text-[13px] font-medium text-white shadow-lg shadow-black/40 backdrop-blur-sm">
            {name}
            <span className="ml-px text-white/40">↗</span>
          </div>
        </Html>
      )}
    </group>
  );
}

export function Houses({
  stars,
  highlight = -1,
  night = 0,
  stargazers = null,
  onSelect,
}: {
  stars: number;
  wind?: number;
  highlight?: number;
  night?: number;
  stargazers?: Stargazer[] | null;
  onSelect?: (i: number) => void;
}) {
  const makeBuilding = useBuildingFactory();
  const { scene: treeScene } = useGLTF(TREE);
  const { scene: lanternScene } = useGLTF(LANTERN);
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
      {anchors.map((a, i) => (
        <House
          key={i}
          i={i}
          anchor={a}
          active={i < active}
          night={night}
          name={stargazers?.[i]?.login ?? nameForIndex(i)}
          makeBuilding={makeBuilding}
          lanternScene={lanternScene}
          onSelect={onSelect}
          setRef={(idx, g) => {
            groups.current[idx] = g;
          }}
        />
      ))}
    </group>
  );
}

useGLTF.preload(PACK);
useGLTF.preload(LANTERN);
