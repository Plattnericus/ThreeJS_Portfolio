"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";

const BIRD = "/models/bird_orange.glb";

// Same realistic rigged bird as the flock, recoloured to a pale ivory so it
// reads as a peace dove — real mesh, real wing animation. It glides a slow,
// calm solo orbit apart from the others. Clicking it is a quiet secret.
const DOVE_SCALE = 0.75;
const MODEL_YAW = 0; // keep in sync with Birds; flip by Math.PI if reversed

export function Dove({ onFind }: { onFind?: () => void }) {
  const { scene, animations } = useGLTF(BIRD);
  const wrapper = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  const { obj, mixer, chest, spine } = useMemo(() => {
    const obj = cloneSkeleton(scene);
    // Recolour to ivory: drop the plumage colour map (keeps normal/roughness
    // relief) and tint white, with a faint glow so the dove is findable.
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material) {
        const src = Array.isArray(o.material) ? o.material : [o.material];
        o.material = src.map((m) => {
          const c = (m as THREE.MeshStandardMaterial).clone();
          c.map = null;
          c.color = new THREE.Color("#f3f2ec");
          if ("emissive" in c) {
            c.emissive = new THREE.Color("#fffaf0");
            c.emissiveIntensity = 0.18;
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
      action.timeScale = 0.6; // graceful, gliding body motion
    }
    // wings are skinned to the chest/spine (no wing bones) — flap those
    let chest: THREE.Object3D | null = null;
    let spine: THREE.Object3D | null = null;
    obj.traverse((o) => {
      if (/^Chest_/.test(o.name)) chest = o as THREE.Object3D;
      else if (/^Spine/.test(o.name)) spine = o as THREE.Object3D;
    });
    return { obj, mixer, chest: chest as THREE.Object3D | null, spine: spine as THREE.Object3D | null };
  }, [scene, animations]);

  useEffect(() => {
    return () => {
      mixer.stopAllAction();
    };
  }, [mixer]);

  const path = useMemo(
    () => ({ radius: 17, height: 14.5, speed: 0.085, phase: 1.2, bob: 0.7 }),
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

    // face direction of travel, bank gently into the turn
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

    // soft wing-beat: pulse + flap the chest/spine the wings are skinned to
    const beat = Math.sin(t * 8 + path.phase);
    g.position.set(pos.x, pos.y + beat * 0.06, pos.z);
    g.rotation.copy(rot.current);

    const target = hovered ? DOVE_SCALE * 1.16 : DOVE_SCALE;
    if (inner.current) {
      const s = inner.current.scale.x + (target - inner.current.scale.x) * 0.12;
      inner.current.scale.setScalar(s);
    }

    mixer.update(dt);
    // flap after the clip so the wings beat (wings are skinned to chest/spine)
    if (chest) chest.rotation.z += beat * 0.2;
    if (spine) spine.rotation.z += beat * 0.1;
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

  return (
    <group ref={wrapper}>
      <group ref={inner} scale={DOVE_SCALE}>
        {/* generous invisible hit target — the dove is small and moving */}
        <mesh
          position={[0, 0.7, 0]}
          onPointerOver={enter}
          onPointerOut={leave}
          onClick={click}
        >
          <sphereGeometry args={[1.4, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <primitive object={obj} />
      </group>
    </group>
  );
}

useGLTF.preload(BIRD);
