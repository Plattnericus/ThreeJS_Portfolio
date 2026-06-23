"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneParams } from "@/lib/weather";

// Owns background, fog and lights, and eases every value toward the target
// SceneParams so weather/time changes fade smoothly instead of snapping.
export function SceneRig({ params }: { params: SceneParams }) {
  const { scene } = useThree();
  const hemi = useRef<THREE.HemisphereLight>(null);
  const dir = useRef<THREE.DirectionalLight>(null);

  const cur = useRef({
    bg: new THREE.Color(params.skyColor),
    fog: new THREE.Color(params.fogColor),
    fogNear: params.fogNear,
    fogFar: params.fogFar,
    sun: new THREE.Color(params.sunColor),
    sunI: params.sunIntensity,
    pos: new THREE.Vector3(...params.sunPos),
    hemiI: params.ambient,
    sky: new THREE.Color(params.skyColor),
  });

  if (!scene.background) scene.background = cur.current.bg.clone();
  if (!scene.fog)
    scene.fog = new THREE.Fog(
      cur.current.fog.clone(),
      params.fogNear,
      params.fogFar,
    );

  useFrame((_, dt) => {
    const k = Math.min(1, dt * 1.4);
    const c = cur.current;

    c.bg.lerp(new THREE.Color(params.skyColor), k);
    (scene.background as THREE.Color).copy(c.bg);

    const fog = scene.fog as THREE.Fog;
    c.fog.lerp(new THREE.Color(params.fogColor), k);
    fog.color.copy(c.fog);
    c.fogNear += (params.fogNear - c.fogNear) * k;
    c.fogFar += (params.fogFar - c.fogFar) * k;
    fog.near = c.fogNear;
    fog.far = c.fogFar;

    if (dir.current) {
      c.sunI += (params.sunIntensity - c.sunI) * k;
      dir.current.intensity = c.sunI;
      c.sun.lerp(new THREE.Color(params.sunColor), k);
      dir.current.color.copy(c.sun);
      c.pos.lerp(new THREE.Vector3(...params.sunPos), k);
      dir.current.position.copy(c.pos);
    }
    if (hemi.current) {
      c.hemiI += (params.ambient - c.hemiI) * k;
      hemi.current.intensity = c.hemiI;
      c.sky.lerp(new THREE.Color(params.skyColor), k);
      hemi.current.color.copy(c.sky);
    }
  });

  return (
    <>
      <hemisphereLight
        ref={hemi}
        intensity={params.ambient}
        color={params.skyColor}
        groundColor="#3a3326"
      />
      <directionalLight
        ref={dir}
        position={params.sunPos}
        intensity={params.sunIntensity}
        color={params.sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={40}
        shadow-camera-bottom={-20}
      />
    </>
  );
}
