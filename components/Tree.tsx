"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { animated, useSpring } from "@react-spring/three";
import { foliageFraction, treeScale } from "@/lib/growth";
import { sampleBranchAnchors } from "@/lib/branches";
import { MAX_HOUSES } from "@/lib/layout";

// Carve a clean bubble of foliage above each platform so leaves never poke into
// the houses/decks — the village stays clean.
const CLEAR_RADIUS = 2.7; // horizontal clearance around a platform (local units)
const CLEAR_TOP = 0.05; // start clearing just below the deck surface, upward

/**
 * The hero tree. It ALWAYS looks like a complete, leafy tree — growth is just
 * uniform scale (small nice tree at few stars → big nice tree at many). Uses the
 * model's own baked foliage so it reads as a real tree, with a wind sway.
 */
export function Tree({
  stars,
  wind = 1,
  leafColor = "#5aa238",
  snow = 0,
  children,
  ...props
}: {
  stars: number;
  wind?: number;
  leafColor?: string;
  snow?: number;
} & JSX.IntrinsicElements["group"]) {
  const { scene } = useGLTF("/models/tree.glb");
  const swayRef = useRef<THREE.Group>(null);
  const leafMats = useRef<THREE.MeshStandardMaterial[]>([]);
  const leafMeshes = useRef<THREE.Mesh[]>([]);

  // Platform anchors (same tree-local space as Houses/Bridges) + a shared
  // uniform block driving the leaf-clip shader.
  const anchors = useMemo(
    () => sampleBranchAnchors(scene, MAX_HOUSES),
    [scene],
  );
  const clearUniforms = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < MAX_HOUSES; i++)
      pts.push(anchors[i] ? anchors[i].pos.clone() : new THREE.Vector3());
    return {
      uClear: { value: pts },
      uClearCount: { value: 0 },
      uClearR2: { value: CLEAR_RADIUS * CLEAR_RADIUS },
      uClearTop: { value: CLEAR_TOP },
    };
  }, [anchors]);

  const tree = useMemo(() => {
    const root = scene.clone(true);
    root.updateMatrixWorld(true); // bake leaf mesh matrices in tree-local space
    leafMats.current = [];
    leafMeshes.current = [];
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      const mat = (obj.material as THREE.MeshStandardMaterial).clone();
      obj.material = mat;
      if (obj.name.startsWith("Leaf")) {
        mat.roughness = 0.75;
        // Discard leaf fragments sitting above a platform deck within its
        // clearance, so foliage never intrudes into the houses.
        const m2r = obj.matrixWorld.clone();
        mat.onBeforeCompile = (shader) => {
          shader.uniforms.uClear = clearUniforms.uClear;
          shader.uniforms.uClearCount = clearUniforms.uClearCount;
          shader.uniforms.uClearR2 = clearUniforms.uClearR2;
          shader.uniforms.uClearTop = clearUniforms.uClearTop;
          shader.uniforms.uMeshToRoot = { value: m2r };
          shader.vertexShader = shader.vertexShader
            .replace(
              "#include <common>",
              `#include <common>\nvarying vec3 vRootPos;\nuniform mat4 uMeshToRoot;`,
            )
            .replace(
              "#include <begin_vertex>",
              `#include <begin_vertex>\nvRootPos = (uMeshToRoot * vec4(position, 1.0)).xyz;`,
            );
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              `#include <common>\nvarying vec3 vRootPos;\nuniform vec3 uClear[${MAX_HOUSES}];\nuniform int uClearCount;\nuniform float uClearR2;\nuniform float uClearTop;`,
            )
            .replace(
              "#include <clipping_planes_fragment>",
              `#include <clipping_planes_fragment>\nfor (int i = 0; i < ${MAX_HOUSES}; i++) {\n  if (i >= uClearCount) break;\n  vec3 c = uClear[i];\n  vec2 d = vRootPos.xz - c.xz;\n  if (dot(d, d) < uClearR2 && vRootPos.y > c.y + uClearTop) { discard; }\n}`,
            );
        };
        mat.needsUpdate = true;
        leafMats.current.push(mat);
        leafMeshes.current.push(obj);
      }
    });
    return root;
  }, [scene, clearUniforms]);

  // Foliage fills in with stars: reveal a growing fraction of the leaf clusters,
  // and clear leaves around exactly the platforms that currently exist.
  useEffect(() => {
    const n = leafMeshes.current.length;
    const reveal = Math.ceil(n * foliageFraction(stars));
    leafMeshes.current.forEach((m, i) => (m.visible = i < reveal));
    clearUniforms.uClearCount.value = Math.min(
      MAX_HOUSES,
      Math.max(0, Math.floor(stars)),
    );
  }, [stars, tree, clearUniforms]);

  // Seasonal tint + frost on the foliage.
  useMemo(() => {
    const c = new THREE.Color(leafColor).lerp(
      new THREE.Color("#ffffff"),
      snow * 0.5,
    );
    leafMats.current.forEach((m) => m.color.copy(c));
  }, [leafColor, snow]);

  useFrame((state) => {
    if (!swayRef.current) return;
    const t = state.clock.elapsedTime;
    swayRef.current.rotation.z = Math.sin(t * (0.6 + wind * 0.25)) * 0.015 * wind;
    swayRef.current.rotation.x = Math.cos(t * 0.5 + 1.3) * 0.008 * wind;
  });

  const { scale } = useSpring({
    scale: treeScale(stars),
    config: { mass: 1, tension: 120, friction: 26 },
  });

  return (
    <animated.group scale={scale} {...props}>
      <group ref={swayRef}>
        <primitive object={tree} />
        {children}
      </group>
    </animated.group>
  );
}

useGLTF.preload("/models/tree.glb");
