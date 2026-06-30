"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneParams } from "@/lib/weather";

// Palette anchors for the gradient sky. Sunrise/sunset push the horizon to warm
// orange and the zenith to a soft purple for that cinematic, real-light look.
const NIGHT_H = new THREE.Color("#1b2330");
const DAY_H = new THREE.Color("#b8d3df");
const SUNSET_H = new THREE.Color("#e88b4d");
const NIGHT_Z = new THREE.Color("#0b1020");
const DAY_Z = new THREE.Color("#477fa7");
const SUNSET_Z = new THREE.Color("#5b4f72");

/**
 * A big sky dome (follows the camera) with a custom gradient + sun-glow shader.
 * Horizon and zenith colours, plus a warm low-sun band, are driven by the live
 * sun direction and day factor, so dawn and dusk glow cinematically.
 */
export function Sky({ params }: { params: SceneParams }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uHorizon: { value: new THREE.Color("#aecfe6") },
          uZenith: { value: new THREE.Color("#2f6fb0") },
          uSunColor: { value: new THREE.Color("#ffffff") },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uGlow: { value: 1 },
        },
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vDir;
          uniform vec3 uHorizon;
          uniform vec3 uZenith;
          uniform vec3 uSunColor;
          uniform vec3 uSunDir;
          uniform float uGlow;
          void main() {
            vec3 d = normalize(vDir);
            float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
            vec3 col = mix(uHorizon, uZenith, pow(clamp(d.y, 0.0, 1.0), 0.5));
            // sun: soft halo + tight disc
            float s = max(dot(d, uSunDir), 0.0);
            float halo = pow(s, 5.0) * 0.34 + pow(s, 90.0) * 0.7 + pow(s, 1600.0) * 2.2;
            col += uSunColor * halo * uGlow;
            // warm glow hugging the horizon toward the sun (sunrise/sunset)
            vec2 dh = normalize(vec2(d.x, d.z) + 1e-5);
            vec2 sh = normalize(vec2(uSunDir.x, uSunDir.z) + 1e-5);
            float toward = pow(max(dot(dh, sh), 0.0), 2.5);
            float band = (1.0 - smoothstep(0.0, 0.28, abs(d.y)));
            col += uSunColor * band * toward * uGlow * 0.46;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    [],
  );

  const cur = useRef({
    h: new THREE.Color("#aecfe6"),
    z: new THREE.Color("#2f6fb0"),
    sun: new THREE.Color("#ffffff"),
    glow: 1,
    dir: new THREE.Vector3(0, 1, 0),
  });
  const tH = useMemo(() => new THREE.Color(), []);
  const tZ = useMemo(() => new THREE.Color(), []);

  useFrame((_, dt) => {
    const mesh = meshRef.current;
    if (mesh) mesh.position.copy(camera.position); // dome rides with the camera

    const day = THREE.MathUtils.clamp(params.dayFactor, 0, 1);
    cur.current.dir.lerp(
      new THREE.Vector3(...params.sunPos).normalize(),
      Math.min(1, dt * 2),
    );
    const el = cur.current.dir.y; // sun elevation
    // warm only when the sun sits low AND there is some daylight (dawn/dusk)
    const low = THREE.MathUtils.clamp(1 - Math.abs(el) / 0.45, 0, 1);
    const warm =
      low *
      THREE.MathUtils.smoothstep(day, 0.03, 0.22) *
      (1 - THREE.MathUtils.smoothstep(day, 0.55, 0.85));

    tH.copy(NIGHT_H).lerp(DAY_H, day).lerp(SUNSET_H, warm);
    tZ.copy(NIGHT_Z).lerp(DAY_Z, day).lerp(SUNSET_Z, warm * 0.7);

    const k = Math.min(1, dt * 1.5);
    cur.current.h.lerp(tH, k);
    cur.current.z.lerp(tZ, k);
    cur.current.sun.lerp(new THREE.Color(params.sunColor), k);
    cur.current.glow += (day * (1 + warm * 1.5) - cur.current.glow) * k;

    const u = material.uniforms;
    (u.uHorizon.value as THREE.Color).copy(cur.current.h);
    (u.uZenith.value as THREE.Color).copy(cur.current.z);
    (u.uSunColor.value as THREE.Color).copy(cur.current.sun);
    (u.uSunDir.value as THREE.Vector3).copy(cur.current.dir);
    u.uGlow.value = cur.current.glow;
  });

  return (
    <mesh ref={meshRef} material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[100, 32, 16]} />
    </mesh>
  );
}
