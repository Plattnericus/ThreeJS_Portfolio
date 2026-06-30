"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { makeWing, flapAngle } from "@/lib/wing";

const BIRD = "/models/bird_orange.glb";

// The realistic rigged bird recoloured to ivory + broad procedural wings that
// actually flap → a detailed peace dove. It glides a calm, findable solo orbit
// over the island. Clicking it is a quiet secret (opens the in-memoriam panel).
const DOVE_SCALE = 1.0;
const MODEL_YAW = 0;
const WING_COLOR = "#f4f3ec";

export function Dove({
  interactive = true,
  onFind,
}: {
  interactive?: boolean;
  onFind?: () => void;
}) {
  const { scene, animations } = useGLTF(BIRD);
  const wrapper = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  const { obj, mixer, wingL, wingR } = useMemo(() => {
    const obj = cloneSkeleton(scene);
    // Recolour to ivory: drop the plumage colour map, tint white, faint glow.
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material) {
        const src = Array.isArray(o.material) ? o.material : [o.material];
        o.material = src.map((m) => {
          const c = (m as THREE.MeshStandardMaterial).clone();
          c.map = null;
          c.color = new THREE.Color("#f3f2ec");
          if ("emissive" in c) {
            c.emissive = new THREE.Color("#fffaf0");
            c.emissiveIntensity = 0.2;
          }
          if ("roughness" in c) c.roughness = Math.min(1, (c.roughness ?? 0.7) + 0.1);
          if ("metalness" in c) c.metalness = 0;
          return c;
        });
        o.castShadow = true;
      }
    });
    const mixer = new THREE.AnimationMixer(obj);
    if (animations[0]) {
      const action = mixer.clipAction(animations[0]);
      action.play();
      action.timeScale = 0.6; // graceful head/tail motion
    }
    const wingR = makeWing(1, WING_COLOR, "#d2d2c8", 0.9);
    const wingL = makeWing(-1, WING_COLOR, "#d2d2c8", 0.9);
    wingR.position.set(0.14, 0.72, 0.08);
    wingL.position.set(-0.14, 0.72, 0.08);
    return { obj, mixer, wingL, wingR };
  }, [scene, animations]);

  useEffect(() => {
    return () => {
      mixer.stopAllAction();
    };
  }, [mixer]);

  useEffect(() => {
    if (!interactive) {
      setHovered(false);
      document.body.style.cursor = "auto";
    }
  }, [interactive]);

  // calm, findable orbit over the island
  const path = useMemo(
    () => ({ radius: 14, height: 12.5, speed: 0.11, phase: 1.2, bob: 0.7 }),
    [],
  );
  const rot = useRef(new THREE.Euler(0, 0, 0, "YXZ"));
  const prev = useRef(new THREE.Vector3());

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const g = wrapper.current;
    if (!g) return;
    const a = t * path.speed + path.phase;
    const pos = new THREE.Vector3(
      Math.cos(a) * path.radius,
      path.height + Math.sin(t * 0.45 + path.bob) * 1.6,
      Math.sin(a) * path.radius,
    );

    const vel = pos.clone().sub(prev.current);
    prev.current.copy(pos);
    const sp = vel.length();
    if (sp > 1e-4) {
      const yaw = Math.atan2(vel.x, vel.z) + MODEL_YAW;
      const pitch = -Math.asin(THREE.MathUtils.clamp(vel.y / sp, -1, 1)) * 0.6;
      let dyaw = yaw - rot.current.y;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      rot.current.y += dyaw * Math.min(1, dt * 6);
      rot.current.x += (pitch - rot.current.x) * Math.min(1, dt * 4);
      rot.current.z += (-dyaw * 6 - rot.current.z) * Math.min(1, dt * 4);
    }

    // graceful flapping wings + a body bob synced to the beat
    const hz = 6;
    const flap = flapAngle(t, path.phase, true, hz);
    wingR.rotation.z = flap;
    wingL.rotation.z = -flap;
    g.position.set(pos.x, pos.y + Math.sin(t * hz + path.phase) * 0.05, pos.z);
    g.rotation.copy(rot.current);

    const target = hovered ? DOVE_SCALE * 1.16 : DOVE_SCALE;
    if (inner.current) {
      const s = inner.current.scale.x + (target - inner.current.scale.x) * 0.12;
      inner.current.scale.setScalar(s);
    }
    mixer.update(dt);
  });

  const enter = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = "pointer";
  };
  const leave = () => {
    setHovered(false);
    document.body.style.cursor = "auto";
  };
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onFind?.();
  };
  const hitHandlers =
    interactive && onFind
      ? {
          onPointerOver: enter,
          onPointerOut: leave,
          onClick: click,
        }
      : {};

  return (
    <group ref={wrapper}>
      <group ref={inner} scale={DOVE_SCALE}>
        {/* generous invisible hit target — the dove is small and moving */}
        <mesh position={[0, 0.7, 0]} {...hitHandlers}>
          <sphereGeometry args={[1.5, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <primitive object={obj} />
        <primitive object={wingL} />
        <primitive object={wingR} />
      </group>
    </group>
  );
}

useGLTF.preload(BIRD);
