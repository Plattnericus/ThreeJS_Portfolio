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
import { Bloom, EffectComposer, HueSaturation, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { sampleIslandSurface } from "@/lib/surface";
import { sampleBranchAnchors } from "@/lib/branches";
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
import { NightSky } from "./NightSky";
import { CozyFlyControls } from "./CozyFlyControls";
import { treeHeight } from "@/lib/growth";
import { spineAt } from "@/lib/bonsai";
import { MAX_HOUSES } from "@/lib/layout";
import { deckRadius, TIER_SIZE, resolveTier } from "@/lib/rarity";
import type { CloudLayerParams, SceneParams } from "@/lib/weather";
import type { Stargazer } from "@/lib/stargazers";
import {
  QUALITY_PROFILES,
  QualityContext,
  useQualityProfile,
  type ResolvedGraphicsQuality as Quality,
} from "@/lib/quality";
import {
  cameraBus,
  DEFAULT_FOV,
  ROTATE_FAST_MULTIPLIER,
  ROTATE_SPEED,
  TILT_SPEED,
  ZOOM_FOV,
} from "@/lib/cameraBus";

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

export type { ResolvedGraphicsQuality } from "@/lib/quality";
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

    float steps = clamp(uSteps, 6.0, 30.0);
    float stride = rayLen / steps;
    // per-pixel jitter on the march offset removes visible step banding
    float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    vec2 wind = normalize(uWindDir);
    vec3 color = vec3(0.0);
    float alpha = 0.0;
    float threshold = mix(0.86, 0.32, clamp(uCoverage, 0.0, 1.0));

    for (int i = 0; i < 32; i++) {
      if (float(i) >= steps || alpha > 0.965) break;
      float fi = (float(i) + jitter) / steps;
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

    // silver lining: strong forward scattering brightens cloud edges that
    // sit between the camera and the sun (golden rims at a low sun)
    float silver = pow(max(dot(rd, uSunDir), 0.0), 6.0);
    color *= 1.0 + silver * 0.5;

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
  const profile = useQualityProfile();
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
    m.uniforms.uSteps.value = Math.round(
      THREE.MathUtils.lerp(6, profile.cloudMaxSteps, quality),
    );
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
  const profile = useQualityProfile();
  if (moving || profile.cloudLayers === 1) {
    return <CloudVolumeLayer layer={params.clouds.mid} params={params} quality={quality} order={-2} />;
  }

  return (
    <group>
      {profile.cloudLayers === 3 && (
        <CloudVolumeLayer layer={params.clouds.high} params={params} quality={quality * 0.84} order={-3} />
      )}
      <CloudVolumeLayer layer={params.clouds.mid} params={params} quality={quality} order={-2} />
      <CloudVolumeLayer layer={params.clouds.low} params={params} quality={quality * 0.92} order={-1} />
    </group>
  );
}

// Reads the DOM rotate-controls bus and drives the orbit camera (left/right
// spin + up/down tilt). Kept as a tiny useFrame component so button presses
// never touch React state per frame.
function CameraRotateDriver() {
  useFrame((state, dt) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    const targetFov = cameraBus.zoom ? ZOOM_FOV : DEFAULT_FOV;
    if (Math.abs(camera.fov - targetFov) > 0.02) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
      camera.updateProjectionMatrix();
    }
    if (cameraBus.rotate === 0 && cameraBus.tilt === 0) return;
    const controls = state.controls as unknown as {
      getAzimuthalAngle?: () => number;
      setAzimuthalAngle?: (a: number) => void;
      getPolarAngle?: () => number;
      setPolarAngle?: (a: number) => void;
    } | null;
    if (!controls?.getAzimuthalAngle || !controls.setAzimuthalAngle) return;
    const fast = cameraBus.fast ? ROTATE_FAST_MULTIPLIER : 1;
    if (cameraBus.rotate !== 0) {
      controls.setAzimuthalAngle(
        controls.getAzimuthalAngle() + cameraBus.rotate * ROTATE_SPEED * fast * dt,
      );
    }
    if (cameraBus.tilt !== 0 && controls.getPolarAngle && controls.setPolarAngle) {
      const next = THREE.MathUtils.clamp(
        controls.getPolarAngle() - cameraBus.tilt * TILT_SPEED * fast * dt,
        0.12,
        Math.PI / 1.8 - 0.01,
      );
      controls.setPolarAngle(next);
    }
  });
  return null;
}

type HouseFocusTarget = {
  target: [number, number, number];
  cameraPosition: [number, number, number];
};

function CameraFocusRig({
  defaultTarget,
  focusTarget,
  focusKey,
}: {
  defaultTarget: [number, number, number];
  focusTarget: HouseFocusTarget | null;
  focusKey: number | null;
}) {
  const desiredTarget = useRef(new THREE.Vector3());
  const desiredCamera = useRef(new THREE.Vector3());
  const driveCamera = useRef(false);

  useEffect(() => {
    driveCamera.current = focusTarget !== null;
  }, [focusKey, focusTarget]);

  useFrame((state, dt) => {
    const controls = state.controls as unknown as {
      target?: THREE.Vector3;
      update?: () => void;
    } | null;
    if (!controls?.target) return;

    const target = focusTarget?.target ?? defaultTarget;
    desiredTarget.current.set(target[0], target[1], target[2]);
    const targetEase = 1 - Math.exp(-dt * (focusTarget ? 5.2 : 3.4));
    controls.target.lerp(desiredTarget.current, targetEase);

    if (focusTarget && driveCamera.current) {
      desiredCamera.current.set(
        focusTarget.cameraPosition[0],
        focusTarget.cameraPosition[1],
        focusTarget.cameraPosition[2],
      );
      state.camera.position.lerp(desiredCamera.current, 1 - Math.exp(-dt * 3.9));
      if (state.camera.position.distanceToSquared(desiredCamera.current) < 0.035) {
        driveCamera.current = false;
      }
    }

    controls.update?.();
    // NOTE: no positive render-priority here — any useFrame priority > 0 turns
    // OFF R3F's automatic gl.render, which blanks the whole scene on tiers
    // without the EffectComposer (low/medium). Default priority keeps auto-render.
  });

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

// Fills the island plateau using the sampled island surface.
function Plateau({
  wind,
  gust,
  windVec,
  night,
  season,
  cloudCover = 0,
  grassBlades,
  grassTufts,
  budget = 1,
  moving = false,
}: {
  wind: number;
  gust: number;
  windVec: [number, number];
  night: number;
  season: SceneParams["season"];
  cloudCover?: number;
  grassBlades: number;
  grassTufts: number;
  budget?: number;
  moving?: boolean;
}) {
  const { scene } = useGLTF("/models/island.glb");
  const profile = useQualityProfile();
  const ambientBudget = THREE.MathUtils.clamp(budget, 0.45, 1);
  const surface = useMemo(
    () => sampleIslandSurface(scene, ISLAND_SCALE),
    [scene],
  );
  return (
    <>
      <Grass wind={wind} gust={gust} windVec={windVec} cloudCover={cloudCover} count={grassBlades} surface={surface} />
      <GrassClumps wind={wind} gust={gust} windVec={windVec} cloudCover={cloudCover} count={grassTufts} surface={surface} />
      <Flora radius={PLATEAU_R + 2} surface={surface} />
      <Fireflies
        night={night}
        count={Math.max(8, Math.round(profile.fireflies * ambientBudget))}
        baseY={PLATEAU_Y - 0.5}
        radius={PLATEAU_R + 1}
        height={11}
      />
      <FallingLeaves
        wind={wind}
        gust={gust}
        windVec={windVec}
        season={season}
        surface={surface}
        treeY={TREE_Y}
        radius={PLATEAU_R + 2}
        budget={ambientBudget}
        moving={moving}
      />
    </>
  );
}

export default function Experience({
  stars,
  params,
  highlight = -1,
  focusedHouse = null,
  fly = false,
  stargazers = null,
  graphicsQuality = "medium",
  uiOverlayOpen = false,
  onSelectHouse,
  onFindDove,
  onReady,
}: {
  stars: number;
  params: SceneParams;
  highlight?: number;
  focusedHouse?: number | null;
  fly?: boolean;
  stargazers?: Stargazer[] | null;
  graphicsQuality?: Quality;
  uiOverlayOpen?: boolean;
  onSelectHouse?: (i: number) => void;
  onFindDove?: () => void;
  onReady?: () => void;
}) {
  const quality = QUALITY_PROFILES[graphicsQuality];
  // Night factor drives warm lights and fireflies.
  const night = Math.min(1, Math.max(0, 1 - params.dayFactor * 1.5));
  // Visible, DEPTH-TESTED sun disc: the z-buffer occludes it behind the tree,
  // so bloom can only glow where the sun is genuinely visible (real physics —
  // light through canopy gaps, never through wood).
  const sunFar = useMemo<[number, number, number]>(() => {
    const p = new THREE.Vector3(...params.sunPos).normalize().multiplyScalar(120);
    return [p.x, p.y, p.z];
  }, [params.sunPos]);
  // Quality presets keep motion responsive without dropping the scene into a visibly pixelated state.
  const [dpr, setDpr] = useState(quality.idleDpr);
  const [cloudQuality, setCloudQuality] = useState(quality.idleCloudQuality);
  // Extra degrade knob: scales particle budgets down when the GPU struggles,
  // so PerformanceMonitor has more to give back than resolution alone.
  const [perfBudget, setPerfBudget] = useState(1);
  // Last-resort degrade: swap real leaf shadows back to the cheap proxy.
  const [shadowFallback, setShadowFallback] = useState(false);
  const [cameraMoving, setCameraMoving] = useState(false);
  const settleTimer = useRef<number | null>(null);
  const interactionMoving = fly || cameraMoving;
  const performanceMoving = interactionMoving || uiOverlayOpen;
  const motionDpr = Math.min(dpr, quality.movingDpr);
  const effectiveDpr = interactionMoving
    ? motionDpr
    : Math.min(dpr, quality.maxDpr);
  const effectiveCloudQuality = performanceMoving
    ? Math.min(cloudQuality, quality.movingCloudQuality * 0.65)
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

  useEffect(() => {
    if (focusedHouse === null) return;
    markCameraMoving();
    const id = window.setTimeout(markCameraSettling, 960);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus changes are the only trigger.
  }, [focusedHouse]);

  // Orbit around the current trunk center.
  const worldH = treeHeight(stars) * TREE_BOOST;
  // A grown tree pushes the camera far out — scale the fog band with it so
  // the scene never sinks into a white wash at high star counts.
  const fogScale = THREE.MathUtils.clamp(worldH / 12, 1, 3.2);
  const trunkTargetLocal = spineAt(Math.max(3.8, treeHeight(stars) * 0.52));
  const orbitTarget: [number, number, number] = [
    trunkTargetLocal.x * TREE_BOOST,
    TREE_Y + trunkTargetLocal.y * TREE_BOOST,
    trunkTargetLocal.z * TREE_BOOST,
  ];
  const houseAnchors = useMemo(() => sampleBranchAnchors(null, MAX_HOUSES), []);
  const focusTarget = useMemo<HouseFocusTarget | null>(() => {
    if (focusedHouse === null) return null;
    const active = Math.min(houseAnchors.length, Math.max(0, Math.floor(stars)));
    const anchor = houseAnchors[focusedHouse];
    if (!anchor || focusedHouse >= active) return null;

    const tier = resolveTier(focusedHouse, stargazers);
    const size = TIER_SIZE[tier];
    const deck = deckRadius(focusedHouse, stargazers) * TREE_BOOST;
    const target = new THREE.Vector3(
      anchor.pos.x * TREE_BOOST,
      TREE_Y + (anchor.pos.y + 0.72 + size * 0.46) * TREE_BOOST,
      anchor.pos.z * TREE_BOOST,
    );
    const radial = new THREE.Vector3(anchor.pos.x, 0, anchor.pos.z);
    if (radial.lengthSq() < 0.001) radial.set(1, 0, 1);
    radial.normalize();
    const distance = THREE.MathUtils.clamp(deck * 4.9 + 7.2, 10, 18);
    const lift = THREE.MathUtils.clamp(size * 2.4 + 2.8, 4.4, 7.4);
    const cameraPosition = target.clone().add(
      new THREE.Vector3(radial.x * distance, lift, radial.z * distance),
    );

    return {
      target: [target.x, target.y, target.z],
      cameraPosition: [cameraPosition.x, cameraPosition.y, cameraPosition.z],
    };
  }, [focusedHouse, houseAnchors, stargazers, stars]);
  const camMax = THREE.MathUtils.clamp(worldH * 1.6 + 26, 40, 340);
  const ambientBudget = THREE.MathUtils.clamp(perfBudget, 0.45, 1);
  const birdCount = Math.max(2, Math.round(4 * ambientBudget));
  const bloomEnabled = quality.bloom;
  const postprocessingSamples = quality.postprocessingSamples;

  return (
    <Canvas
      key={graphicsQuality}
      frameloop="always"
      shadows
      dpr={effectiveDpr}
      camera={{ position: [26, 18, 26], fov: DEFAULT_FOV, near: 0.1, far: 600 }}
      gl={{
        antialias: quality.antialias,
        alpha: false,
        powerPreference: "high-performance",
      }}
      performance={{ min: 0.55 }}
      onCreated={({ gl }) => {
        gl.shadowMap.enabled = true;
        gl.shadowMap.type =
          quality.shadowType === "pcfsoft" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.12;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
    >
      <QualityContext.Provider value={quality}>
      <Suspense fallback={null}>
        <AssetGate />
        {/* Adaptive resolution keeps animation responsive. */}
        <PerformanceMonitor
          bounds={() => [52, 72]}
          flipflops={4}
          onDecline={() => {
            setDpr((d) => Math.max(quality.minDpr, +(d - 0.14).toFixed(2)));
            setCloudQuality((q) => Math.max(quality.movingCloudQuality, +(q - 0.1).toFixed(2)));
            setPerfBudget((b) => Math.max(0.45, +(b - 0.2).toFixed(2)));
          }}
          onIncline={() => {
            setDpr((d) => Math.min(quality.maxDpr, +(d + 0.1).toFixed(2)));
            setCloudQuality((q) => Math.min(quality.idleCloudQuality, +(q + 0.06).toFixed(2)));
            setPerfBudget((b) => Math.min(1, +(b + 0.12).toFixed(2)));
          }}
          onFallback={() => {
            setDpr(quality.minDpr);
            setCloudQuality(quality.movingCloudQuality);
            setPerfBudget(0.45);
            setShadowFallback(true);
          }}
        />
        <SceneReadySignal onReady={onReady} />
        <SceneRig params={params} shadowsActive={!performanceMoving} fogScale={fogScale} />
        <Sky params={params} />
        <NightSky params={params} />

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

        {/* Sun disc: rendered physically in the dome AND as a mesh here so the
            god-rays pass has a real occludable light source (the BSL look —
            golden shafts through the canopy at a low sun). */}
        <mesh position={sunFar} visible={params.sunElevationDeg > -0.8}>
          <sphereGeometry args={[4.4, 20, 20]} />
          {/* Opaque: the god-rays depth mask needs a solid occludable source;
              softness comes from the dome shader + bloom. */}
          <meshBasicMaterial color={params.sunColor} toneMapped={false} depthWrite={false} />
        </mesh>

        {/* Weather-driven volumetric clouds. */}
        <VolumetricClouds
          params={params}
          quality={effectiveCloudQuality}
          moving={performanceMoving}
        />
        <Dove interactive={!fly} onFind={onFindDove} moving={performanceMoving} />

        <Float
          speed={performanceMoving ? 0 : 1.1}
          rotationIntensity={performanceMoving ? 0 : 0.1}
          floatIntensity={performanceMoving ? 0 : 0.5}
        >
          <Island snow={params.snow} scale={ISLAND_SCALE} cloudCover={params.cloud} windVec={params.windVec} />
          <Plateau
            wind={params.wind}
            gust={params.gust}
            windVec={params.windVec}
            night={night}
            season={params.season}
            cloudCover={params.cloud}
            grassBlades={quality.grassBlades}
            grassTufts={quality.grassTufts}
            budget={ambientBudget}
            moving={performanceMoving}
          />
          <group position={[0, TREE_Y, 0]} scale={TREE_BOOST}>
            <Tree
              stars={stars}
              wind={params.wind}
              gust={params.gust}
              windVec={params.windVec}
              leafColor={params.leafColor}
              snow={params.snow}
              twilight={params.twilight}
              sunDir={params.sunPos}
              sunColor={params.sunColor}
              sunIntensity={params.sunIntensity}
              wet={params.precip === "rain" ? params.precipIntensity : 0}
              cloudCover={params.cloud}
              forceProxyShadows={shadowFallback}
              stargazers={stargazers}
            >
              <Houses
                stars={stars}
                wind={params.wind}
                highlight={highlight}
                focused={focusedHouse}
                night={night}
                stargazers={stargazers}
                interactive={!fly}
                onSelect={onSelectHouse}
                moving={performanceMoving}
              />
              <Bridges stars={stars} night={night} stargazers={stargazers} />
              <Ants
                stars={stars}
                stargazers={stargazers}
                budget={ambientBudget}
                moving={performanceMoving}
              />
              <Birds count={birdCount} stars={stars} moving={performanceMoving} />
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
          budget={perfBudget}
          moving={performanceMoving}
        />
        <Preload all />

        {/* Filmic finish (high/extreme): gentle bloom on lanterns, fireflies
            and the low sun; ACES stays the single tone-mapping step. */}
        {/* BSL-style finish (high/extreme). NO screen-space god-rays pass: its
            depth mask kept compositing the sun OVER the canopy. Instead the
            depth-tested sun disc + wide bloom produce the same shafts-through-
            gaps look with guaranteed occlusion. The post stack sleeps while
            the camera moves, then returns at the selected quality tier. */}
        {bloomEnabled && (
          <EffectComposer enabled={!performanceMoving} multisampling={postprocessingSamples}>
            {/* Golden hour drives the finish: as the sun crosses the horizon
                the bloom widens and its threshold drops so light spills
                through the canopy gaps (the BSL shafts), and the grade warms. */}
            <Bloom
              mipmapBlur
              intensity={0.62 + params.twilight * 0.5}
              luminanceThreshold={0.75 - params.twilight * 0.18}
              luminanceSmoothing={0.3}
            />
            <HueSaturation saturation={0.18 + params.twilight * 0.12} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          </EffectComposer>
        )}
      </Suspense>
      </QualityContext.Provider>

      {!fly && <CameraRotateDriver />}
      {!fly && (
        <CameraFocusRig
          defaultTarget={orbitTarget}
          focusTarget={focusTarget}
          focusKey={focusedHouse}
        />
      )}
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
          autoRotate={!uiOverlayOpen}
          autoRotateSpeed={0.35}
          onStart={markCameraMoving}
          onEnd={markCameraSettling}
        />
      )}
    </Canvas>
  );
}
