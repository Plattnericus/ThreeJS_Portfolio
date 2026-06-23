"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Precip } from "@/lib/weather";

const AREA = 34; // half-extent in X/Z
const TOP = 46;

// Instanced rain/snow over the scene. Particles recycle within a box so the
// count stays bounded regardless of how long it runs.
export function Weather({
  precip,
  intensity,
  wind,
}: {
  precip: Precip;
  intensity: number;
  wind: number;
}) {
  const isSnow = precip === "snow";
  const count = precip === "none" ? 0 : Math.floor((isSnow ? 700 : 1100) * intensity);

  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(Math.max(count, 1) * 3);
    const speeds = new Float32Array(Math.max(count, 1));
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * AREA * 2;
      positions[i * 3 + 1] = Math.random() * TOP;
      positions[i * 3 + 2] = (Math.random() - 0.5) * AREA * 2;
      speeds[i] = (isSnow ? 1.4 : 9) * (0.7 + Math.random() * 0.6);
    }
    return { positions, speeds };
  }, [count, isSnow]);

  const ref = useRef<THREE.Points>(null);

  useFrame((state, dt) => {
    const pts = ref.current;
    if (!pts || count === 0) return;
    const arr = pts.geometry.attributes.position.array as Float32Array;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const yi = i * 3 + 1;
      arr[yi] -= speeds[i] * dt;
      // wind pushes along X; snow also drifts on a sine
      arr[i * 3] += wind * dt * (isSnow ? 1.2 : 2.2);
      if (isSnow) arr[i * 3] += Math.sin(t + i) * dt * 0.4;
      if (arr[yi] < -10) {
        arr[yi] = TOP;
        arr[i * 3] = (Math.random() - 0.5) * AREA * 2;
        arr[i * 3 + 2] = (Math.random() - 0.5) * AREA * 2;
      } else if (arr[i * 3] > AREA) {
        arr[i * 3] = -AREA;
      }
    }
    pts.geometry.attributes.position.needsUpdate = true;
  });

  if (count === 0) return null;

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={isSnow ? 0.32 : 0.14}
        color={isSnow ? "#ffffff" : "#aac4e0"}
        transparent
        opacity={isSnow ? 0.95 : 0.6}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}
