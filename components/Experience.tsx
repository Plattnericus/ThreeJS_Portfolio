"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Float,
  OrbitControls,
  Cloud,
  Clouds,
  PerformanceMonitor,
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
import { FallingLeaves } from "./FallingLeaves";
import { Birds } from "./Birds";
import { Dove } from "./Dove";
import { Weather } from "./Weather";
import { SceneRig } from "./SceneRig";
import { Sky } from "./Sky";
import { CozyFlyControls } from "./CozyFlyControls";
import { treeHeight } from "@/lib/growth";
import { spineAt } from "@/lib/bonsai";
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
  { pos: [0, 26, 44], bounds: [18, 4, 8], volume: 9, growth: 6 },
] as const;

// Island shrunk ~20%; the tree/grass sit on its (now lower) plateau.
const ISLAND_SCALE = 0.8;
const TREE_Y = 7.35 * ISLAND_SCALE;
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
  "/models/weighted_wood_platform.glb",
];

function AssetGate() {
  useGLTF(MODEL_ASSETS);
  useTexture("/cloud.png");
  return null;
}

// Clouds that DRIFT across the sky on the wind and CYCLE smoothly with the
// weather: bright fluffy banks when clear/cloudy, darkening into a heavy grey
// storm deck during a thunderstorm (the bright clouds "go away"). Drift wraps far
// off-screen so it's endless; cover/storm ease so weather changes fade, not snap.
const CLOUD_DRIFT_RANGE = 150;
function DriftingClouds({ params }: { params: SceneParams }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const eased = useRef({ cover: params.cloud, storm: params.storm ? 1 : 0 });
  const acc = useRef(0);
  // Throttled "visible" look — re-renders only a few times/sec while a transition
  // is in flight, then settles (no per-frame React churn).
  const [look, setLook] = useState(() => ({
    cover: params.cloud,
    storm: params.storm ? 1 : 0,
  }));

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    // (1) endless wind drift — wraps far from the camera so the loop is invisible.
    const drift = (0.5 + params.wind * 1.0) * d;
    const half = CLOUD_DRIFT_RANGE / 2;
    for (const g of refs.current) {
      if (!g) continue;
      g.position.x += drift;
      if (g.position.x > half) g.position.x -= CLOUD_DRIFT_RANGE;
    }
    // (2) ease cover/storm toward the live targets so weather cycles smoothly.
    const e = eased.current;
    const k = Math.min(1, d * 0.7);
    e.cover += (params.cloud - e.cover) * k;
    e.storm += ((params.storm ? 1 : 0) - e.storm) * k;
    // (3) push to props at ~8 Hz until settled.
    acc.current += d;
    if (acc.current >= 0.12) {
      acc.current = 0;
      if (Math.abs(e.cover - look.cover) > 0.004 || Math.abs(e.storm - look.storm) > 0.004) {
        setLook({ cover: e.cover, storm: e.storm });
      }
    }
  });

  // bright (clear) → grey (cloudy) → dark heavy deck (storm). In a storm the bright
  // clouds are fully replaced by the dark storm colour.
  const color =
    "#" +
    new THREE.Color("#f5f2ec")
      .lerp(new THREE.Color("#8c98a0"), Math.min(1, look.cover * 1.1))
      .lerp(new THREE.Color("#39424b"), look.storm)
      .getHexString();
  const opacity = THREE.MathUtils.lerp(0.26, 0.82, Math.max(look.cover, look.storm * 0.95));
  const churn = 0.12 + params.wind * 0.05 + look.storm * 0.28; // storms roil more

  return (
    <Clouds material={THREE.MeshBasicMaterial} texture="/cloud.png" limit={650}>
      {CLOUD_LAYOUT.map((c, i) => (
        <group
          key={i}
          ref={(g) => {
            refs.current[i] = g;
          }}
        >
          <Cloud
            seed={i + 1}
            position={c.pos as unknown as [number, number, number]}
            bounds={c.bounds as unknown as [number, number, number]}
            volume={c.volume}
            growth={c.growth}
            color={color}
            opacity={opacity}
            speed={churn}
          />
        </group>
      ))}
    </Clouds>
  );
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
function Plateau({
  wind,
  night,
  season,
}: {
  wind: number;
  night: number;
  season: SceneParams["season"];
}) {
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
      <FallingLeaves wind={wind} season={season} surface={surface} treeY={TREE_Y} radius={PLATEAU_R + 2} />
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
  // Resolution auto-scales to hold the framerate (PerformanceMonitor below).
  const [dpr, setDpr] = useState(1.5);
  // Frame the spiral tower: it grows taller with stars, so aim at its mid-height
  // and let the user pull back far enough to see the whole thing.
  const worldH = treeHeight(stars) * TREE_BOOST;
  const trunkTargetLocal = spineAt(Math.max(3.8, treeHeight(stars) * 0.52));
  const orbitTarget: [number, number, number] = [
    trunkTargetLocal.x * TREE_BOOST,
    TREE_Y + trunkTargetLocal.y * TREE_BOOST,
    trunkTargetLocal.z * TREE_BOOST,
  ];
  const camMax = THREE.MathUtils.clamp(worldH * 1.6 + 26, 40, 340);

  return (
    <Canvas
      shadows="soft"
      dpr={dpr}
      camera={{ position: [26, 18, 26], fov: 42, near: 0.1, far: 600 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFShadowMap;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.07;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
    >
      <Suspense fallback={null}>
        <AssetGate />
        {/* Hold a high framerate by trading resolution: drop dpr when fps sags,
            restore it when it recovers (no AdaptiveDpr — autorotate would pin it
            regressed). */}
        <PerformanceMonitor
          bounds={() => [90, 140]}
          flipflops={4}
          onDecline={() => setDpr((d) => Math.max(0.85, +(d - 0.2).toFixed(2)))}
          onIncline={() => setDpr((d) => Math.min(1.5, +(d + 0.2).toFixed(2)))}
          onFallback={() => setDpr(0.85)}
        />
        <SceneReadySignal onReady={onReady} />
        <SceneRig params={params} />
        <Sky params={params} />

        {/* Supplemental fill so the island always reads well — a soft sky-tinted
            bounce + a gentle cool back-fill opposite the sun, lifted at night. */}
        <hemisphereLight
          intensity={0.36 + night * 0.42}
          color="#f8dfb8"
          groundColor="#3f3326"
        />
        <directionalLight
          position={[-14, 12, -10]}
          intensity={0.2 + night * 0.28}
          color="#ffd29a"
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

        {/* Drifting clouds that cycle with the weather (bright → grey → storm). */}
        <DriftingClouds params={params} />
        <Dove onFind={onFindDove} />

        <Float speed={1.1} rotationIntensity={0.1} floatIntensity={0.5}>
          <Island snow={params.snow} scale={ISLAND_SCALE} />
          <Plateau wind={params.wind} night={night} season={params.season} />
          <group position={[0, TREE_Y, 0]} scale={TREE_BOOST}>
            <Tree
              stars={stars}
              wind={params.wind}
              leafColor={params.leafColor}
              snow={params.snow}
              stargazers={stargazers}
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
              <Birds count={4} stars={stars} />
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
          target={orbitTarget}
          enablePan={false}
          minDistance={12}
          maxDistance={camMax}
          maxPolarAngle={Math.PI / 1.8}
          autoRotate
          autoRotateSpeed={0.35}
        />
      )}
    </Canvas>
  );
}
