"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Float,
  OrbitControls,
  FlyControls,
  ContactShadows,
  Cloud,
  Clouds,
  Preload,
  useGLTF,
} from "@react-three/drei";
import * as THREE from "three";
import { sampleIslandSurface } from "@/lib/surface";
import { Island } from "./Island";
import { Tree } from "./Tree";
import { Houses } from "./Houses";
import { Bridges } from "./Bridges";
import { Grass } from "./Grass";
import { GrassClumps } from "./GrassClumps";
import { Flora } from "./Flora";
import { Fireflies } from "./Fireflies";
import { Birds } from "./Birds";
import { Weather } from "./Weather";
import { SceneRig } from "./SceneRig";
import type { SceneParams } from "@/lib/weather";
import type { Stargazer } from "@/lib/stargazers";

// A ring of clouds wrapping the scene so the sky reads full from any angle.
const CLOUD_LAYOUT = [
  { pos: [-48, 24, -18], bounds: [16, 5, 9], volume: 11, growth: 6 },
  { pos: [-30, 30, -44], bounds: [18, 5, 10], volume: 12, growth: 6 },
  { pos: [10, 34, -50], bounds: [22, 6, 11], volume: 14, growth: 7 },
  { pos: [44, 26, -30], bounds: [18, 5, 10], volume: 12, growth: 6 },
  { pos: [50, 20, 14], bounds: [16, 5, 9], volume: 11, growth: 6 },
  { pos: [28, 32, 44], bounds: [20, 6, 10], volume: 13, growth: 7 },
  { pos: [-20, 22, 48], bounds: [18, 5, 10], volume: 12, growth: 6 },
  { pos: [-50, 28, 26], bounds: [16, 5, 9], volume: 11, growth: 6 },
] as const;

// Island shrunk ~20%; the tree/grass sit on its (now lower) plateau.
const ISLAND_SCALE = 0.8;
const TREE_Y = 6.8 * ISLAND_SCALE;
const TREE_BOOST = 1.15;
const PLATEAU_Y = 6.7 * ISLAND_SCALE;
const PLATEAU_R = 10 * ISLAND_SCALE;

// Carpets the island top with grass + flowers placed on the REAL surface (a
// raycast height profile), so coverage reaches the true edge with no bald ground.
function Plateau({ wind, night }: { wind: number; night: number }) {
  const { scene } = useGLTF("/models/island.glb");
  const surface = useMemo(
    () => sampleIslandSurface(scene, ISLAND_SCALE),
    [scene],
  );
  return (
    <>
      <Grass wind={wind} surface={surface} />
      <GrassClumps wind={wind} count={6} surface={surface} />
      <Flora radius={PLATEAU_R + 2} surface={surface} />
      <Fireflies night={night} baseY={PLATEAU_Y - 0.5} radius={PLATEAU_R + 1} height={11} />
    </>
  );
}

export default function Experience({
  stars,
  params,
  highlight = -1,
  fly = false,
  stargazers = null,
  onSelectHouse,
}: {
  stars: number;
  params: SceneParams;
  highlight?: number;
  fly?: boolean;
  stargazers?: Stargazer[] | null;
  onSelectHouse?: (i: number) => void;
}) {
  // Night factor (lights come on at dusk). Sun disc sits far along the sun dir.
  const night = Math.min(1, Math.max(0, 1 - params.dayFactor * 1.5));
  const sunDir = new THREE.Vector3(...params.sunPos).normalize();
  const sunFar = sunDir.multiplyScalar(120);

  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [26, 18, 26], fov: 42, near: 0.1, far: 200 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <Suspense fallback={null}>
        <SceneRig params={params} />

        {/* Supplemental fill so the island always reads well — a soft sky-tinted
            bounce + a gentle cool back-fill opposite the sun, lifted at night. */}
        <hemisphereLight
          intensity={0.55 + night * 0.35}
          color="#fbf0d8"
          groundColor="#33402c"
        />
        <directionalLight
          position={[-14, 12, -10]}
          intensity={0.45 + night * 0.25}
          color="#bcd3ff"
        />

        {/* The sun, sitting where it really is over Sterzing right now. */}
        {params.dayFactor > 0.02 && (
          <mesh position={sunFar.toArray()}>
            <sphereGeometry args={[7, 24, 24]} />
            <meshBasicMaterial
              color={params.sunColor}
              toneMapped={false}
              transparent
              opacity={0.5 + params.dayFactor * 0.5}
            />
          </mesh>
        )}

        {/* A full ring of volumetric clouds; greyer + denser when overcast. */}
        <Clouds material={THREE.MeshBasicMaterial} texture="/cloud.png" limit={400}>
          {CLOUD_LAYOUT.map((c, i) => (
            <Cloud
              key={i}
              seed={i + 1}
              position={c.pos as unknown as [number, number, number]}
              bounds={c.bounds as unknown as [number, number, number]}
              volume={c.volume}
              growth={c.growth}
              color={params.cloud > 0.5 ? "#c2ccd2" : "#ffffff"}
              opacity={0.45 + params.cloud * 0.45}
              speed={0.12}
            />
          ))}
        </Clouds>
        <Birds count={16} />

        <Float speed={1.1} rotationIntensity={0.1} floatIntensity={0.5}>
          <Island snow={params.snow} scale={ISLAND_SCALE} />
          <Plateau wind={params.wind} night={night} />
          <group position={[0, TREE_Y, 0]} scale={TREE_BOOST}>
            <Tree
              stars={stars}
              wind={params.wind}
              leafColor={params.leafColor}
              snow={params.snow}
            >
              <Houses
                stars={stars}
                wind={params.wind}
                highlight={highlight}
                night={night}
                stargazers={stargazers}
                onSelect={onSelectHouse}
              />
              <Bridges stars={stars} night={night} />
            </Tree>
          </group>
        </Float>

        <Weather
          precip={params.precip}
          intensity={params.precipIntensity}
          wind={params.wind}
        />

        <ContactShadows
          position={[0, -9.4 * ISLAND_SCALE, 0]}
          opacity={0.3}
          scale={42 * ISLAND_SCALE}
          blur={2.6}
          far={20}
          frames={60}
        />
        <Preload all />
      </Suspense>

      {fly ? (
        // First-person fly: WASD/arrows to move, drag mouse to look, R/F up-down.
        <FlyControls movementSpeed={16} rollSpeed={0.5} dragToLook />
      ) : (
        <OrbitControls
          makeDefault
          target={[0, 15, 0]}
          enablePan={false}
          minDistance={12}
          maxDistance={60}
          maxPolarAngle={Math.PI / 1.8}
          autoRotate
          autoRotateSpeed={0.35}
        />
      )}
    </Canvas>
  );
}
