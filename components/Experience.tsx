"use client";

import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Float,
  OrbitControls,
  Cloud,
  Clouds,
  Preload,
  useGLTF,
  useTexture,
} from "@react-three/drei";
import * as THREE from "three";
import { sampleIslandSurface } from "@/lib/surface";
import { Island } from "./Island";
import { Tree } from "./Tree";
import { Houses } from "./Houses";
import { Bridges } from "./Bridges";
import { Ants } from "./Ants";
import { Grass } from "./Grass";
import { GrassClumps } from "./GrassClumps";
import { Flora } from "./Flora";
import { Fireflies } from "./Fireflies";
import { Birds } from "./Birds";
import { Dove } from "./Dove";
import { Weather } from "./Weather";
import { SceneRig } from "./SceneRig";
import { Sky } from "./Sky";
import { CozyFlyControls } from "./CozyFlyControls";
import type { SceneParams } from "@/lib/weather";
import type { Stargazer } from "@/lib/stargazers";

// A ring of clouds wrapping the scene so the sky reads full from any angle.
const CLOUD_LAYOUT = [
  { pos: [-18, 20, -24], bounds: [18, 5, 9], volume: 18, growth: 7 },
  { pos: [8, 24, -30], bounds: [22, 6, 10], volume: 20, growth: 8 },
  { pos: [28, 21, -20], bounds: [18, 5, 9], volume: 16, growth: 7 },
  { pos: [-34, 27, -36], bounds: [24, 7, 12], volume: 20, growth: 8 },
  { pos: [4, 34, -54], bounds: [30, 8, 14], volume: 24, growth: 9 },
  { pos: [42, 28, -40], bounds: [24, 7, 12], volume: 19, growth: 8 },
  { pos: [-52, 24, -4], bounds: [20, 6, 11], volume: 16, growth: 7 },
  { pos: [55, 22, 8], bounds: [20, 6, 11], volume: 16, growth: 7 },
  { pos: [34, 33, 42], bounds: [24, 7, 12], volume: 18, growth: 8 },
  { pos: [-22, 28, 50], bounds: [22, 6, 11], volume: 17, growth: 7 },
  { pos: [-54, 31, 30], bounds: [20, 6, 11], volume: 16, growth: 7 },
  { pos: [0, 16, 34], bounds: [18, 4, 8], volume: 11, growth: 6 },
] as const;

// Island shrunk ~20%; the tree/grass sit on its (now lower) plateau.
const ISLAND_SCALE = 0.8;
const TREE_Y = 6.8 * ISLAND_SCALE;
const TREE_BOOST = 1.15;
const PLATEAU_Y = 6.7 * ISLAND_SCALE;
const PLATEAU_R = 10 * ISLAND_SCALE;

const MODEL_ASSETS = [
  "/models/ant.glb",
  "/models/bird_orange.glb",
  "/models/casual_village_buildings_pack.glb",
  "/models/grass.glb",
  "/models/island.glb",
  "/models/leaves.glb",
  "/models/stylized_lantern.glb",
  "/models/suspension_bridge.glb",
  "/models/tiny_isometric_room.glb",
  "/models/tree.glb",
  "/models/weighted_wood_platform.glb",
];

function AssetGate() {
  useGLTF(MODEL_ASSETS);
  useTexture("/cloud.png");
  return null;
}

function SceneReadySignal({ onReady }: { onReady?: () => void }) {
  const fired = useRef(false);
  useFrame(() => {
    if (fired.current) return;
    fired.current = true;
    requestAnimationFrame(() => onReady?.());
  });
  return null;
}

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
  onFindDove,
  onReady,
}: {
  stars: number;
  params: SceneParams;
  highlight?: number;
  fly?: boolean;
  stargazers?: Stargazer[] | null;
  onSelectHouse?: (i: number) => void;
  onFindDove?: () => void;
  onReady?: () => void;
}) {
  // Night factor (lights come on at dusk). Sun disc sits far along the sun dir.
  const night = Math.min(1, Math.max(0, 1 - params.dayFactor * 1.5));
  const sunDir = new THREE.Vector3(...params.sunPos).normalize();
  const sunFar = sunDir.multiplyScalar(120);

  return (
    <Canvas
      shadows="soft"
      dpr={[1, 1.5]}
      camera={{ position: [26, 18, 26], fov: 42, near: 0.1, far: 200 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.08;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
    >
      <Suspense fallback={null}>
        <AssetGate />
        <SceneReadySignal onReady={onReady} />
        <SceneRig params={params} />
        <Sky params={params} />

        {/* Supplemental fill so the island always reads well — a soft sky-tinted
            bounce + a gentle cool back-fill opposite the sun, lifted at night. */}
        <hemisphereLight
          intensity={0.4 + night * 0.3}
          color="#fbf0d8"
          groundColor="#33402c"
        />
        <directionalLight
          position={[-14, 12, -10]}
          intensity={0.28 + night * 0.2}
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

        {/* Layered volumetric clouds: close soft banks plus a wider sky ring. */}
        <Clouds material={THREE.MeshBasicMaterial} texture="/cloud.png" limit={650}>
          {CLOUD_LAYOUT.map((c, i) => (
            <Cloud
              key={i}
              seed={i + 1}
              position={c.pos as unknown as [number, number, number]}
              bounds={c.bounds as unknown as [number, number, number]}
              volume={c.volume}
              growth={c.growth}
              color={params.cloud > 0.5 ? "#c5ccd0" : "#f2f0e8"}
              opacity={0.58 + params.cloud * 0.34}
              speed={0.06 + params.wind * 0.02}
            />
          ))}
        </Clouds>
        <Dove onFind={onFindDove} />

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
              <Bridges stars={stars} night={night} stargazers={stargazers} />
              <Ants stars={stars} stargazers={stargazers} />
              <Birds count={7} />
            </Tree>
          </group>
        </Float>

        <Weather
          precip={params.precip}
          intensity={params.precipIntensity}
          wind={params.wind}
          storm={params.storm}
        />
        <Preload all />
      </Suspense>

      {fly ? (
        <CozyFlyControls speed={8} />
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
