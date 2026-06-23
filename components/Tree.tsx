"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { animated, useSpring } from "@react-spring/three";
import { treeScale } from "@/lib/growth";

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

  const tree = useMemo(() => {
    const root = scene.clone(true);
    leafMats.current = [];
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      const mat = (obj.material as THREE.MeshStandardMaterial).clone();
      obj.material = mat;
      if (obj.name.startsWith("Leaf")) {
        mat.roughness = 0.75;
        leafMats.current.push(mat);
      }
    });
    return root;
  }, [scene]);

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
