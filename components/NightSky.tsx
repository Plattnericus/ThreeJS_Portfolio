"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { ResolvedGraphicsQuality } from "./Experience";
import type { SceneParams } from "@/lib/weather";

const STAR_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  varying vec3 vColor;
  varying float vPhase;
  uniform float uIntensity;
  void main() {
    vColor = color;
    vPhase = aPhase;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (220.0 / max(1.0, -mvPosition.z)) * (0.25 + uIntensity * 0.75);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vPhase;
  uniform float uTime;
  uniform float uIntensity;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = dot(p, p);
    if (d > 0.25) discard;
    float core = smoothstep(0.25, 0.015, d);
    float twinkle = 0.76 + 0.24 * sin(uTime * (0.7 + fract(vPhase) * 1.6) + vPhase * 19.17);
    gl_FragColor = vec4(vColor * (0.82 + twinkle * 0.3), core * uIntensity * twinkle);
  }
`;

const MOON_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const MOON_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uPhase;
  uniform float uIntensity;
  uniform float uTime;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec2 hash2(vec2 p) {
    return vec2(hash(p), hash(p + 17.13));
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.55;
    for (int i = 0; i < 5; i++) {
      v += noise(p) * a;
      p = p * 2.08 + vec2(8.31, 4.77);
      a *= 0.48;
    }
    return v;
  }

  float craterField(vec2 p) {
    vec2 g = p * 7.0;
    vec2 cell = floor(g);
    vec2 local = fract(g);
    float c = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 off = vec2(float(x), float(y));
        vec2 seed = cell + off;
        vec2 center = hash2(seed);
        float radius = mix(0.12, 0.32, hash(seed + 9.4));
        float d = length(local - off - center);
        float bowl = smoothstep(radius, 0.0, d) * 0.32;
        float rim = smoothstep(radius * 1.18, radius * 0.93, d) * smoothstep(radius * 0.66, radius * 0.92, d);
        c += rim * 0.28 - bowl;
      }
    }
    return c;
  }

  void main() {
    vec2 p = (vUv - 0.5) * 2.55;
    float r = length(p);
    float halo = (1.0 - smoothstep(0.98, 1.32, r)) * smoothstep(0.72, 1.08, r);
    if (r > 1.32) discard;

    if (r > 1.0) {
      gl_FragColor = vec4(vec3(0.74, 0.82, 1.0), halo * uIntensity * 0.18);
      return;
    }

    vec3 normal = normalize(vec3(p.xy, sqrt(max(0.001, 1.0 - r * r))));
    float angle = uPhase * 6.28318530718;
    vec3 lightDir = normalize(vec3(sin(angle), 0.0, -cos(angle)));
    float lit = smoothstep(-0.03, 0.08, dot(normal, lightDir));
    float limb = smoothstep(1.0, 0.18, r);
    float terrain = fbm(p * 3.0 + vec2(0.0, uTime * 0.001));
    float fine = fbm(p * 15.0);
    float craters = craterField(p);
    float maria = smoothstep(0.54, 0.86, fbm(p * 2.0 + 4.2));
    vec3 base = mix(vec3(0.68, 0.70, 0.67), vec3(0.93, 0.91, 0.82), terrain * 0.7 + fine * 0.18);
    base = mix(base, vec3(0.43, 0.45, 0.46), maria * 0.32);
    base += craters * vec3(0.58, 0.56, 0.5);
    base *= 0.58 + limb * 0.52;
    base *= 0.12 + lit * 0.95;
    float alpha = (1.0 - smoothstep(0.97, 1.0, r)) * uIntensity * (0.1 + lit * 0.9);
    gl_FragColor = vec4(base, alpha);
  }
`;

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function starCount(quality: ResolvedGraphicsQuality): number {
  if (quality === "low") return 260;
  if (quality === "high") return 900;
  return 560;
}

function StarField({ params, quality }: { params: SceneParams; quality: ResolvedGraphicsQuality }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const count = starCount(quality);
    const rand = seeded(40429);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const band = rand() < 0.38;
      const theta = rand() * Math.PI * 2;
      const y = band
        ? THREE.MathUtils.clamp((rand() - 0.5) * 0.28 + Math.sin(theta * 1.7) * 0.1, -0.08, 0.92)
        : Math.pow(rand(), 0.42) * 1.08 - 0.08;
      const r = Math.sqrt(Math.max(0.001, 1 - y * y));
      const radius = 96;
      positions[i * 3] = Math.cos(theta) * r * radius;
      positions[i * 3 + 1] = y * radius;
      positions[i * 3 + 2] = Math.sin(theta) * r * radius;

      const temp = rand();
      color.set(temp < 0.18 ? "#bcd7ff" : temp > 0.82 ? "#ffe0b8" : "#f6f4ea");
      const bright = Math.pow(rand(), 2.1);
      colors[i * 3] = color.r * (0.58 + bright * 0.7);
      colors[i * 3 + 1] = color.g * (0.58 + bright * 0.7);
      colors[i * 3 + 2] = color.b * (0.58 + bright * 0.7);
      sizes[i] = 1.05 + bright * 2.3;
      phases[i] = rand() * 1000;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    return g;
  }, [quality]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uIntensity: { value: 0 },
    }),
    [],
  );

  useFrame((state, dt) => {
    const m = material.current;
    if (!m) return;
    m.uniforms.uTime.value = state.clock.elapsedTime;
    m.uniforms.uIntensity.value += (params.starsIntensity - m.uniforms.uIntensity.value) * Math.min(1, dt * 1.25);
  });

  return (
    <points geometry={geometry} renderOrder={-8} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={STAR_VERTEX}
        fragmentShader={STAR_FRAGMENT}
        vertexColors
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function Moon({ params }: { params: SceneParams }) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const { camera } = useThree();
  const moonOffset = useMemo(() => new THREE.Vector3(), []);
  const uniforms = useMemo(
    () => ({
      uPhase: { value: params.moon.phase },
      uIntensity: { value: 0 },
      uTime: { value: 0 },
    }),
    [],
  );

  useFrame((state, dt) => {
    const current = mesh.current;
    const m = material.current;
    if (!current || !m) return;
    moonOffset.set(...params.moon.pos).applyQuaternion(camera.quaternion);
    current.position.copy(moonOffset);
    current.scale.setScalar(params.moon.size);
    current.quaternion.copy(camera.quaternion);
    m.uniforms.uPhase.value += (params.moon.phase - m.uniforms.uPhase.value) * Math.min(1, dt * 1.6);
    m.uniforms.uIntensity.value += (params.moon.visible - m.uniforms.uIntensity.value) * Math.min(1, dt * 1.2);
    m.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <mesh ref={mesh} renderOrder={-5} frustumCulled={false}>
      <planeGeometry args={[1, 1, 48, 48]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={MOON_VERTEX}
        fragmentShader={MOON_FRAGMENT}
        transparent
        depthWrite={false}
        depthTest
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export function NightSky({
  params,
  quality,
}: {
  params: SceneParams;
  quality: ResolvedGraphicsQuality;
}) {
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();

  useFrame(() => {
    group.current?.position.copy(camera.position);
  });

  return (
    <>
      <group ref={group} renderOrder={-10}>
        <StarField params={params} quality={quality} />
        <Moon params={params} />
      </group>
      <directionalLight
        position={params.moon.pos}
        intensity={params.moon.visible * 0.18}
        color="#dbe7ff"
      />
    </>
  );
}
