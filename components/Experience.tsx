"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Float,
  OrbitControls,
  PerformanceMonitor,
  Preload,
  useGLTF,
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
import type { CloudLayerParams, SceneParams } from "@/lib/weather";
import type { Stargazer } from "@/lib/stargazers";

// Shared scene scale for the island and tree.
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
  return null;
}

const CLOUD_RANGE = 118;

export type ResolvedGraphicsQuality = "low" | "medium" | "high";

const QUALITY_CONFIG = {
  low: {
    minDpr: 0.72,
    idleDpr: 0.92,
    maxDpr: 1.05,
    movingDpr: 0.86,
    idleCloudQuality: 0.34,
    movingCloudQuality: 0.08,
    grassBlades: 12000,
    grassTufts: 0,
  },
  medium: {
    minDpr: 0.9,
    idleDpr: 1.28,
    maxDpr: 1.45,
    movingDpr: 1.1,
    idleCloudQuality: 0.54,
    movingCloudQuality: 0.12,
    grassBlades: 20000,
    grassTufts: 1,
  },
  high: {
    minDpr: 1.08,
    idleDpr: 1.65,
    maxDpr: 1.9,
    movingDpr: 1.35,
    idleCloudQuality: 0.74,
    movingCloudQuality: 0.16,
    grassBlades: 26000,
    grassTufts: 1,
  },
} satisfies Record<
  ResolvedGraphicsQuality,
  {
    minDpr: number;
    idleDpr: number;
    maxDpr: number;
    movingDpr: number;
    idleCloudQuality: number;
    movingCloudQuality: number;
    grassBlades: number;
    grassTufts: number;
  }
>;
const CLOUD_VERTEX = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CLOUD_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uCoverage;
  uniform float uDensity;
  uniform float uHeight;
  uniform float uThickness;
  uniform float uScale;
  uniform float uOpacity;
  uniform float uSpeed;
  uniform float uDetail;
  uniform float uSteps;
  uniform float uRange;
  uniform float uFog;
  uniform float uDay;
  uniform vec2 uWindDir;
  uniform vec3 uBaseColor;
  uniform vec3 uShadowColor;
  uniform vec3 uSunDir;
  varying vec3 vWorldPos;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.55;
    for (int i = 0; i < 5; i++) {
      v += noise(p) * a;
      p = p * 2.07 + vec3(13.1, 7.7, 4.9);
      a *= 0.48;
    }
    return v;
  }

  vec2 boxHit(vec3 ro, vec3 rd, vec3 mn, vec3 mx) {
    vec3 inv = 1.0 / rd;
    vec3 t0 = (mn - ro) * inv;
    vec3 t1 = (mx - ro) * inv;
    vec3 tmin = min(t0, t1);
    vec3 tmax = max(t0, t1);
    return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
  }

  void main() {
    if (uCoverage < 0.015 || uDensity < 0.01 || uOpacity < 0.01) discard;
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorldPos - ro);
    vec3 mn = vec3(-uRange, uHeight - uThickness * 0.5, -uRange);
    vec3 mx = vec3(uRange, uHeight + uThickness * 0.5, uRange);
    vec2 hit = boxHit(ro, rd, mn, mx);
    if (hit.x > hit.y || hit.y < 0.0) discard;

    float start = max(hit.x, 0.0);
    float end = hit.y;
    float rayLen = min(end - start, 95.0);
    if (rayLen <= 0.0) discard;

    float steps = clamp(uSteps, 6.0, 22.0);
    float stride = rayLen / steps;
    vec2 wind = normalize(uWindDir);
    vec3 color = vec3(0.0);
    float alpha = 0.0;
    float threshold = mix(0.86, 0.32, clamp(uCoverage, 0.0, 1.0));

    for (int i = 0; i < 24; i++) {
      if (float(i) >= steps || alpha > 0.965) break;
      float fi = (float(i) + 0.5) / steps;
      vec3 p = ro + rd * (start + fi * rayLen);
      float vertical = 1.0 - abs(p.y - uHeight) / max(0.001, uThickness * 0.5);
      vertical = smoothstep(0.0, 0.72, vertical);
      vec2 drift = wind * uTime * uSpeed;
      vec3 q = vec3((p.xz + drift).x * uScale, p.y * uScale * 0.42, (p.xz + drift).y * uScale);
      float large = fbm(q * 0.68);
      float detail = fbm(q * (2.0 + uDetail));
      float n = mix(large, detail, 0.33);
      float edge = smoothstep(threshold, threshold + 0.23, n) * vertical;
      float d = edge * uDensity;
      float a = 1.0 - exp(-d * stride * 0.075);
      a *= (1.0 - alpha);
      float light = clamp(dot(normalize(vec3(wind.x * 0.2, 0.6, wind.y * 0.2) + uSunDir * 0.45), uSunDir) * 0.5 + 0.5, 0.0, 1.0);
      vec3 sampleColor = mix(uShadowColor, uBaseColor, 0.42 + light * 0.42 + vertical * 0.16);
      color += sampleColor * a;
      alpha += a;
    }

    alpha *= uOpacity;
    alpha *= 1.0 - clamp(uFog * 0.18, 0.0, 0.18);
    if (alpha < 0.012) discard;
    gl_FragColor = vec4(color / max(alpha, 0.001), alpha);
  }
`;

function CloudVolumeLayer({
  layer,
  params,
  quality,
  order,
}: {
  layer: CloudLayerParams;
  params: SceneParams;
  quality: number;
  order: number;
}) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCoverage: { value: layer.coverage },
      uDensity: { value: layer.density },
      uHeight: { value: layer.height },
      uThickness: { value: layer.thickness },
      uScale: { value: layer.scale },
      uOpacity: { value: layer.opacity },
      uSpeed: { value: layer.speed },
      uDetail: { value: layer.detail },
      uSteps: { value: 18 },
      uRange: { value: CLOUD_RANGE },
      uFog: { value: params.clouds.fog },
      uDay: { value: params.dayFactor },
      uWindDir: { value: new THREE.Vector2(params.windVec[0], params.windVec[1]) },
      uBaseColor: { value: new THREE.Color(params.clouds.baseColor) },
      uShadowColor: { value: new THREE.Color(params.clouds.shadowColor) },
      uSunDir: { value: new THREE.Vector3(...params.sunPos).normalize() },
    }),
    [],
  );

  useFrame((_, dt) => {
    const m = material.current;
    if (!m) return;
    const k = Math.min(1, dt * 0.9);
    m.uniforms.uTime.value = _.clock.elapsedTime;
    m.uniforms.uCoverage.value += (layer.coverage - m.uniforms.uCoverage.value) * k;
    m.uniforms.uDensity.value += (layer.density - m.uniforms.uDensity.value) * k;
    m.uniforms.uOpacity.value += (layer.opacity - m.uniforms.uOpacity.value) * k;
    m.uniforms.uSpeed.value += (layer.speed * (1 + params.gust * 0.18) - m.uniforms.uSpeed.value) * k;
    m.uniforms.uFog.value += (params.clouds.fog - m.uniforms.uFog.value) * k;
    m.uniforms.uDay.value += (params.dayFactor - m.uniforms.uDay.value) * k;
    m.uniforms.uSteps.value = Math.round(THREE.MathUtils.lerp(6, 18, quality));
    (m.uniforms.uWindDir.value as THREE.Vector2).set(params.windVec[0], params.windVec[1]).normalize();
    (m.uniforms.uBaseColor.value as THREE.Color).set(params.clouds.baseColor);
    (m.uniforms.uShadowColor.value as THREE.Color).set(params.clouds.shadowColor);
    (m.uniforms.uSunDir.value as THREE.Vector3).set(...params.sunPos).normalize();
  });

  return (
    <mesh position={[0, layer.height, 0]} renderOrder={order} frustumCulled={false}>
      <boxGeometry args={[CLOUD_RANGE * 2, layer.thickness, CLOUD_RANGE * 2, 1, 1, 1]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={CLOUD_VERTEX}
        fragmentShader={CLOUD_FRAGMENT}
        transparent
        depthWrite={false}
        depthTest
        side={THREE.BackSide}
      />
    </mesh>
  );
}

function VolumetricClouds({
  params,
  quality,
  moving,
}: {
  params: SceneParams;
  quality: number;
  moving: boolean;
}) {
  if (moving) {
    return <CloudVolumeLayer layer={params.clouds.mid} params={params} quality={quality} order={-2} />;
  }

  return (
    <group>
      <CloudVolumeLayer layer={params.clouds.high} params={params} quality={quality * 0.84} order={-3} />
      <CloudVolumeLayer layer={params.clouds.mid} params={params} quality={quality} order={-2} />
      <CloudVolumeLayer layer={params.clouds.low} params={params} quality={quality * 0.92} order={-1} />
    </group>
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

// Fills the island plateau using the sampled island surface.
function Plateau({
  wind,
  gust,
  windVec,
  night,
  season,
  grassBlades,
  grassTufts,
}: {
  wind: number;
  gust: number;
  windVec: [number, number];
  night: number;
  season: SceneParams["season"];
  grassBlades: number;
  grassTufts: number;
}) {
  const { scene } = useGLTF("/models/island.glb");
  const surface = useMemo(
    () => sampleIslandSurface(scene, ISLAND_SCALE),
    [scene],
  );
  return (
    <>
      <Grass wind={wind} gust={gust} windVec={windVec} count={grassBlades} surface={surface} />
      <GrassClumps wind={wind} gust={gust} windVec={windVec} count={grassTufts} surface={surface} />
      <Flora radius={PLATEAU_R + 2} surface={surface} />
      <Fireflies night={night} baseY={PLATEAU_Y - 0.5} radius={PLATEAU_R + 1} height={11} />
      <FallingLeaves wind={wind} gust={gust} windVec={windVec} season={season} surface={surface} treeY={TREE_Y} radius={PLATEAU_R + 2} />
    </>
  );
}

export default function Experience({
  stars,
  params,
  highlight = -1,
  fly = false,
  stargazers = null,
  graphicsQuality = "medium",
  onSelectHouse,
  onFindDove,
  onReady,
}: {
  stars: number;
  params: SceneParams;
  highlight?: number;
  fly?: boolean;
  stargazers?: Stargazer[] | null;
  graphicsQuality?: ResolvedGraphicsQuality;
  onSelectHouse?: (i: number) => void;
  onFindDove?: () => void;
  onReady?: () => void;
}) {
  const quality = QUALITY_CONFIG[graphicsQuality];
  // Night factor drives warm lights and fireflies.
  const night = Math.min(1, Math.max(0, 1 - params.dayFactor * 1.5));
  const sunDir = new THREE.Vector3(...params.sunPos).normalize();
  const sunFar = sunDir.multiplyScalar(120);
  // Quality presets keep motion responsive without dropping the scene into a visibly pixelated state.
  const [dpr, setDpr] = useState(quality.idleDpr);
  const [cloudQuality, setCloudQuality] = useState(quality.idleCloudQuality);
  const [cameraMoving, setCameraMoving] = useState(false);
  const settleTimer = useRef<number | null>(null);
  const performanceMoving = fly || cameraMoving;
  const effectiveDpr = performanceMoving
    ? Math.min(dpr, quality.movingDpr)
    : Math.min(dpr, quality.maxDpr);
  const effectiveCloudQuality = performanceMoving
    ? Math.min(cloudQuality, quality.movingCloudQuality)
    : cloudQuality;

  useEffect(() => {
    setDpr(quality.idleDpr);
    setCloudQuality(quality.idleCloudQuality);
  }, [quality.idleCloudQuality, quality.idleDpr]);

  useEffect(() => {
    return () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    };
  }, []);

  const markCameraMoving = () => {
    setCameraMoving(true);
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
  };

  const markCameraSettling = () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => setCameraMoving(false), 420);
  };
  // Orbit around the current trunk center.
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
      key={graphicsQuality}
      shadows
      dpr={effectiveDpr}
      camera={{ position: [26, 18, 26], fov: 42, near: 0.1, far: 600 }}
      gl={{
        antialias: graphicsQuality === "high",
        alpha: false,
        powerPreference: "high-performance",
      }}
      performance={{ min: 0.55 }}
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
        {/* Adaptive resolution keeps animation responsive. */}
        <PerformanceMonitor
          bounds={() => [52, 72]}
          flipflops={4}
          onDecline={() => {
            setDpr((d) => Math.max(quality.minDpr, +(d - 0.14).toFixed(2)));
            setCloudQuality((q) => Math.max(quality.movingCloudQuality, +(q - 0.1).toFixed(2)));
          }}
          onIncline={() => {
            setDpr((d) => Math.min(quality.maxDpr, +(d + 0.1).toFixed(2)));
            setCloudQuality((q) => Math.min(quality.idleCloudQuality, +(q + 0.06).toFixed(2)));
          }}
          onFallback={() => {
            setDpr(quality.minDpr);
            setCloudQuality(quality.movingCloudQuality);
          }}
        />
        <SceneReadySignal onReady={onReady} />
        <SceneRig params={params} shadowsActive={!performanceMoving} />
        <Sky params={params} />

        {/* Soft fill lights keep the island readable. */}
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

        {/* Sun marker follows the weather-driven sun direction. */}
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

        {/* Weather-driven volumetric clouds. */}
        <VolumetricClouds
          params={params}
          quality={effectiveCloudQuality}
          moving={performanceMoving}
        />
        <Dove interactive={!fly} onFind={onFindDove} />

        <Float speed={1.1} rotationIntensity={0.1} floatIntensity={0.5}>
          <Island snow={params.snow} scale={ISLAND_SCALE} />
          <Plateau
            wind={params.wind}
            gust={params.gust}
            windVec={params.windVec}
            night={night}
            season={params.season}
            grassBlades={quality.grassBlades}
            grassTufts={quality.grassTufts}
          />
          <group position={[0, TREE_Y, 0]} scale={TREE_BOOST}>
            <Tree
              stars={stars}
              wind={params.wind}
              gust={params.gust}
              windVec={params.windVec}
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
                interactive={!fly}
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
          gust={params.gust}
          windVec={params.windVec}
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
          enableDamping
          dampingFactor={0.055}
          minDistance={12}
          maxDistance={camMax}
          maxPolarAngle={Math.PI / 1.8}
          autoRotate
          autoRotateSpeed={0.35}
          onStart={markCameraMoving}
          onEnd={markCameraSettling}
        />
      )}
    </Canvas>
  );
}
