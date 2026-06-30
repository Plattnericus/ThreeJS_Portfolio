"use client";

import { useMemo, useRef } from "react";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

// GLSL helpers: cheap value noise for surface variation.
const NOISE = /* glsl */ `
  float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
  float vnoise(vec3 p){
    vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.0-2.0*f);
    float n=mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                    mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                    mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
    return n;
  }
`;

// Grass-on-top / rock-on-slopes material. The original textures were missing, so
// we drive color procedurally from the world-up normal + noise (a poor-man's
// triplanar) for a believable grassy floating island.
function grassRockMaterial(snowRef: { current: { value: number } }) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSnow = snowRef.current;
    shader.vertexShader =
      "varying vec3 vWPos;\nvarying vec3 vWNrm;\n" +
      shader.vertexShader
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n  vWPos = (modelMatrix*vec4(transformed,1.0)).xyz;",
        )
        .replace(
          "#include <beginnormal_vertex>",
          "#include <beginnormal_vertex>\n  vWNrm = normalize(mat3(modelMatrix)*objectNormal);",
        );
    shader.fragmentShader =
      "uniform float uSnow;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\n" +
      NOISE +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float up = clamp(vWNrm.y, 0.0, 1.0);
        float n = vnoise(vWPos*0.6)*0.5 + vnoise(vWPos*2.4)*0.5;
        vec3 grassA = vec3(0.22,0.36,0.16);
        vec3 grassB = vec3(0.40,0.48,0.25);
        vec3 moss = vec3(0.16,0.26,0.13);
        vec3 grass = mix(mix(grassA, grassB, n), moss, smoothstep(0.55, 1.0, vnoise(vWPos*1.35))*0.35);
        vec3 rockA = vec3(0.42,0.38,0.32);
        vec3 rockB = vec3(0.26,0.24,0.21);
        vec3 soil = vec3(0.30,0.22,0.15);
        vec3 rock = mix(mix(rockA, rockB, n), soil, smoothstep(0.3, 0.9, vnoise(vWPos*1.1))*0.42);
        float g = smoothstep(0.45, 0.80, up + (n-0.5)*0.25);
        diffuseColor.rgb = mix(rock, grass, g);
        // snow settles on up-facing surfaces
        float snowMask = smoothstep(0.35, 0.75, up + (n-0.5)*0.3) * uSnow;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92,0.94,0.98), snowMask);`,
      );
  };
  return mat;
}

export function Island({
  snow = 0,
  ...props
}: { snow?: number } & ThreeElements["group"]) {
  const { scene } = useGLTF("/models/island.glb");
  const snowU = useRef({ value: 0 });

  const island = useMemo(() => {
    const root = scene.clone(true);
    const mat = grassRockMaterial(snowU);
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.castShadow = false;
      obj.receiveShadow = true;
      obj.material = mat;
    });
    return root;
  }, [scene]);

  // ease snow coverage so season/weather changes blend smoothly
  useFrame((_, dt) => {
    snowU.current.value += (snow - snowU.current.value) * Math.min(1, dt * 1.2);
  });

  return <primitive object={island} {...props} />;
}

useGLTF.preload("/models/island.glb");
