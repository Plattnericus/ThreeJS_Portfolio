"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Float,
  OrbitControls,
  FlyControls,
  ContactShadows,
  Cloud,
  Clouds,
} from "@react-three/drei";
import * as THREE from "three";
import { Island } from "./Island";
import { Tree } from "./Tree";
import { Houses } from "./Houses";
import { Bridges } from "./Bridges";
import { Grass } from "./Grass";
import { Birds } from "./Birds";
import { Weather } from "./Weather";
import { SceneRig } from "./SceneRig";
import type { SceneParams } from "@/lib/weather";

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

// The island is centered at the origin; its plateau top is near the upper bound.
const TREE_Y = 6.8;
const TREE_BOOST = 1.15;

export default function Experience({
  stars,
  params,
  highlight = -1,
  fly = false,
}: {
  stars: number;
  params: SceneParams;
  highlight?: number;
  fly?: boolean;
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [26, 18, 26], fov: 42, near: 0.1, far: 200 }}
      gl={{ antialias: true }}
    >
      <Suspense fallback={null}>
        <SceneRig params={params} />

        {/* A full ring of volumetric clouds; greyer + denser when overcast. */}
        <Clouds material={THREE.MeshBasicMaterial} limit={400}>
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
          <Island snow={params.snow} />
          <Grass wind={params.wind} />
          <group position={[0, TREE_Y, 0]} scale={TREE_BOOST}>
            <Tree
              stars={stars}
              wind={params.wind}
              leafColor={params.leafColor}
              snow={params.snow}
            >
              <Houses stars={stars} wind={params.wind} highlight={highlight} />
              <Bridges stars={stars} />
            </Tree>
          </group>
        </Float>

        <Weather
          precip={params.precip}
          intensity={params.precipIntensity}
          wind={params.wind}
        />

        <ContactShadows
          position={[0, -9.4, 0]}
          opacity={0.3}
          scale={42}
          blur={2.6}
          far={20}
        />
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
