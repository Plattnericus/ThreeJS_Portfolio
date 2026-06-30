"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Precip } from "@/lib/weather";

const AREA = 34; // half-extent in X/Z
const TOP = 46;
const MAX_RAIN = 1600;
const MAX_SNOW = 900;

// Snow — soft drifting points. Fixed-size buffer + draw range so changing the
// intensity never resizes a GPU attribute (three.js forbids that).
function Snow({
  intensity,
  wind,
  gust,
  windVec,
}: {
  intensity: number;
  wind: number;
  gust: number;
  windVec: [number, number];
}) {
  const ref = useRef<THREE.Points>(null);
  const count = Math.max(1, Math.floor(MAX_SNOW * intensity));

  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(MAX_SNOW * 3);
    const speeds = new Float32Array(MAX_SNOW);
    for (let i = 0; i < MAX_SNOW; i++) {
      positions[i * 3] = (Math.random() - 0.5) * AREA * 2;
      positions[i * 3 + 1] = Math.random() * TOP;
      positions[i * 3 + 2] = (Math.random() - 0.5) * AREA * 2;
      speeds[i] = 1.4 * (0.7 + Math.random() * 0.6);
    }
    return { positions, speeds };
  }, []);

  useFrame((state, dt) => {
    const pts = ref.current;
    if (!pts) return;
    const arr = pts.geometry.attributes.position.array as Float32Array;
    const t = state.clock.elapsedTime;
    const wx = windVec[0];
    const wz = windVec[1];
    const sx = -wz;
    const sz = wx;
    const flow = wind + gust * 0.28;
    for (let i = 0; i < count; i++) {
      const yi = i * 3 + 1;
      arr[yi] -= speeds[i] * dt;
      const swirl = Math.sin(t + i) * dt * 0.35;
      arr[i * 3] += wx * flow * dt * 1.2 + sx * swirl;
      arr[i * 3 + 2] += wz * flow * dt * 1.2 + sz * swirl;
      if (arr[yi] < -10) {
        arr[yi] = TOP;
        arr[i * 3] = (Math.random() - 0.5) * AREA * 2;
        arr[i * 3 + 2] = (Math.random() - 0.5) * AREA * 2;
      } else {
        if (arr[i * 3] > AREA) arr[i * 3] = -AREA;
        else if (arr[i * 3] < -AREA) arr[i * 3] = AREA;
        if (arr[i * 3 + 2] > AREA) arr[i * 3 + 2] = -AREA;
        else if (arr[i * 3 + 2] < -AREA) arr[i * 3 + 2] = AREA;
      }
    }
    pts.geometry.attributes.position.needsUpdate = true;
    pts.geometry.setDrawRange(0, count);
  });

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.32} color="#ffffff" transparent opacity={0.95} depthWrite={false} sizeAttenuation />
    </points>
  );
}

// Rain — falling streaks (two verts per drop) slanted by the wind. Heavier and
// faster than snow; opacity/length scale up toward a storm.
function Rain({
  intensity,
  wind,
  gust,
  windVec,
}: {
  intensity: number;
  wind: number;
  gust: number;
  windVec: [number, number];
}) {
  const ref = useRef<THREE.LineSegments>(null);
  const count = Math.max(1, Math.floor(MAX_RAIN * Math.max(0.35, intensity)));
  const len = 1.1 + intensity * 1.6; // streak length
  const slant = THREE.MathUtils.clamp((wind + gust * 0.32) * 0.5, 0, 2.4);

  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(MAX_RAIN * 6);
    const speeds = new Float32Array(MAX_RAIN);
    for (let i = 0; i < MAX_RAIN; i++) {
      const x = (Math.random() - 0.5) * AREA * 2;
      const y = Math.random() * TOP;
      const z = (Math.random() - 0.5) * AREA * 2;
      positions[i * 6] = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = z;
      positions[i * 6 + 3] = x;
      positions[i * 6 + 4] = y - 1;
      positions[i * 6 + 5] = z;
      speeds[i] = 26 * (0.75 + Math.random() * 0.5);
    }
    return { positions, speeds };
  }, []);

  useFrame((_, dt) => {
    const seg = ref.current;
    if (!seg) return;
    const arr = seg.geometry.attributes.position.array as Float32Array;
    const flow = wind + gust * 0.32;
    const dx = windVec[0] * slant * len * 0.4;
    const dz = windVec[1] * slant * len * 0.4;
    for (let i = 0; i < count; i++) {
      const o = i * 6;
      let x = arr[o] + windVec[0] * flow * dt * 3.2;
      let y = arr[o + 1] - speeds[i] * dt;
      let z = arr[o + 2] + windVec[1] * flow * dt * 3.2;
      if (y < -8) {
        y = TOP + Math.random() * 6;
        x = (Math.random() - 0.5) * AREA * 2;
        z = (Math.random() - 0.5) * AREA * 2;
      } else {
        if (x > AREA) x = -AREA;
        else if (x < -AREA) x = AREA;
        if (z > AREA) z = -AREA;
        else if (z < -AREA) z = AREA;
      }
      arr[o] = x;
      arr[o + 1] = y;
      arr[o + 2] = z;
      arr[o + 3] = x - dx;
      arr[o + 4] = y - len;
      arr[o + 5] = z - dz;
    }
    seg.geometry.attributes.position.needsUpdate = true;
    seg.geometry.setDrawRange(0, count * 2);
  });

  return (
    <lineSegments ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        color="#9fc2e8"
        transparent
        opacity={0.34 + intensity * 0.3}
        depthWrite={false}
      />
    </lineSegments>
  );
}

// One puffy cartoon cloud cluster = a few overlapping flattened spheres.
function makePuffGeometry(seed: number) {
  const rng = (() => {
    let s = seed * 9973;
    return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  })();
  const geos: THREE.BufferGeometry[] = [];
  const puffs = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < puffs; i++) {
    const r = 2.4 + rng() * 2.2;
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.translate((rng() - 0.5) * 9, (rng() - 0.5) * 1.6, (rng() - 0.5) * 5);
    g.scale(1, 0.7, 1);
    geos.push(g);
  }
  // simple concat merge (position only) then recompute normals for flat shading
  let total = 0;
  geos.forEach((g) => (total += (g.getAttribute("position").array as Float32Array).length));
  const pos = new Float32Array(total);
  let off = 0;
  geos.forEach((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    const a = ng.getAttribute("position").array as Float32Array;
    pos.set(a, off);
    off += a.length;
  });
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(pos.subarray(0, off), 3));
  merged.computeVertexNormals();
  return merged;
}

// Dark storm clouds that roll in (cartoon scale-pop + drift) whenever it rains,
// and flash from within when lightning strikes (driven by `flashRef`).
function StormClouds({
  active,
  flashRef,
  wind,
  gust,
  windVec,
}: {
  active: boolean;
  flashRef: React.MutableRefObject<number>;
  wind: number;
  gust: number;
  windVec: [number, number];
}) {
  const layout = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const ang = (i / 6) * Math.PI * 2 + 0.4;
        const rad = 16 + (i % 3) * 5;
        return {
          geo: makePuffGeometry(i + 1),
          pos: [Math.cos(ang) * rad, 26 + (i % 2) * 4, Math.sin(ang) * rad] as [number, number, number],
          phase: i * 1.3,
          drift: 0.5 + (i % 3) * 0.2,
        };
      }),
    [],
  );
  const groups = useRef<(THREE.Group | null)[]>([]);
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#5b636e",
        roughness: 1,
        metalness: 0,
        flatShading: true,
        emissive: new THREE.Color("#eaf2ff"),
        emissiveIntensity: 0,
      }),
    [],
  );

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    mat.emissiveIntensity = flashRef.current * 1.6;
    for (let i = 0; i < layout.length; i++) {
      const g = groups.current[i];
      if (!g) continue;
      const target = active ? 1 : 0;
      const s = g.scale.x + (target - g.scale.x) * Math.min(1, dt * 3);
      g.scale.setScalar(s);
      const l = layout[i];
      const drift = Math.sin(t * 0.07 * l.drift + l.phase) * (3 + wind * 0.7 + gust * 0.35);
      const cross = Math.cos(t * 0.052 * l.drift + l.phase) * 1.5;
      const sx = -windVec[1];
      const sz = windVec[0];
      g.position.x = l.pos[0] + windVec[0] * drift + sx * cross;
      g.position.y = l.pos[1] + Math.sin(t * 0.4 + l.phase) * 0.6;
      g.position.z = l.pos[2] + windVec[1] * drift + sz * cross;
    }
  });

  return (
    <group>
      {layout.map((l, i) => (
        <group
          key={i}
          ref={(g) => {
            groups.current[i] = g;
          }}
          position={l.pos}
          scale={0.001}
        >
          <mesh geometry={l.geo} material={mat} />
        </group>
      ))}
    </group>
  );
}

// Lightning — a bright flash (sky-wide light), a glowing forked bolt, and a
// short after-flicker, fired at random intervals during a storm.
function Lightning({ flashRef }: { flashRef: React.MutableRefObject<number> }) {
  const light = useRef<THREE.PointLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const bolt = useRef<THREE.LineSegments>(null);
  const next = useRef(1.5);
  const flicker = useRef(0);

  const SEGMENTS = 14;
  const positions = useMemo(() => new Float32Array(SEGMENTS * 2 * 3), []);

  const strike = (originX: number, originZ: number) => {
    const arr = positions;
    let x = originX;
    let y = 34;
    const z = originZ;
    for (let i = 0; i < SEGMENTS; i++) {
      const nx = x + (Math.random() - 0.5) * 3.2;
      const ny = y - (34 - 6) / SEGMENTS;
      arr[i * 6] = x;
      arr[i * 6 + 1] = y;
      arr[i * 6 + 2] = z;
      arr[i * 6 + 3] = nx;
      arr[i * 6 + 4] = ny;
      arr[i * 6 + 5] = z + (Math.random() - 0.5) * 2;
      x = nx;
      y = ny;
    }
    if (bolt.current) {
      bolt.current.geometry.attributes.position.needsUpdate = true;
      bolt.current.position.x = 0;
    }
    if (light.current) light.current.position.set(originX, 30, originZ);
  };

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (t > next.current) {
      // a strike: main flash + scheduled flicker, then a long-ish gap
      strike((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40);
      flashRef.current = 1;
      flicker.current = 2;
      next.current = t + 2.6 + Math.random() * 5;
    } else if (flicker.current > 0 && flashRef.current < 0.12) {
      // quick secondary flashes that real lightning has
      flashRef.current = 0.8;
      flicker.current -= 1;
    }
    // decay the flash
    flashRef.current = Math.max(0, flashRef.current - dt * 4.5);
    const f = flashRef.current;
    if (light.current) light.current.intensity = f * 900;
    if (ambient.current) ambient.current.intensity = f * 1.4;
    const m = bolt.current?.material as THREE.LineBasicMaterial | undefined;
    if (m) m.opacity = f > 0.5 ? 1 : 0;
  });

  return (
    <group>
      <pointLight ref={light} color="#dbe7ff" intensity={0} distance={140} decay={1.4} />
      <ambientLight ref={ambient} color="#cfe0ff" intensity={0} />
      <lineSegments ref={bolt} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          color="#f4f8ff"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </lineSegments>
    </group>
  );
}

// Top-level weather: precipitation + (for rain) rolling storm clouds and, when
// it's a thunderstorm, lightning. Snow keeps its gentle drift.
export function Weather({
  precip,
  intensity,
  wind,
  gust = 0,
  windVec = [1, 0],
  storm = false,
}: {
  precip: Precip;
  intensity: number;
  wind: number;
  gust?: number;
  windVec?: [number, number];
  storm?: boolean;
}) {
  const flashRef = useRef(0);
  const isRain = precip === "rain";

  return (
    <>
      {precip === "snow" && <Snow intensity={intensity} wind={wind} gust={gust} windVec={windVec} />}
      {isRain && <Rain intensity={intensity} wind={wind} gust={gust} windVec={windVec} />}
      <StormClouds active={isRain} flashRef={flashRef} wind={wind} gust={gust} windVec={windVec} />
      {storm && <Lightning flashRef={flashRef} />}
    </>
  );
}
