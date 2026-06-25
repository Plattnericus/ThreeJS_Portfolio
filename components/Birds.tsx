"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { sampleBranchAnchors } from "@/lib/branches";

const BIRD = "/models/bird_orange.glb";
const TREE = "/models/tree.glb";

// Tunables (tree-local units). If the bird flies tail-first, flip MODEL_YAW.
const BIRD_SCALE = 0.5;
const MODEL_YAW = 0;
const CRUISE_SPEED = 7.5;
const TURN_RATE = 2.6;

type State = "cruise" | "toPerch" | "perched" | "launch";

type Bird = {
  obj: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: THREE.Vector3;
  state: State;
  timer: number;
  perchIdx: number;
  rot: THREE.Euler;
  flapPhase: number;
  chest: THREE.Object3D | null;
  spine: THREE.Object3D | null;
};

// The wings are skinned to the Chest/Spine bones (there are no wing bones), so
// rotating those bones flaps the wing geometry.
function flapBones(obj: THREE.Object3D) {
  let chest: THREE.Object3D | null = null;
  let spine: THREE.Object3D | null = null;
  obj.traverse((o) => {
    if (/^Chest_/.test(o.name)) chest = o;
    else if (/^Spine/.test(o.name)) spine = o;
  });
  return { chest, spine };
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// A flight target in the air around the tree. ~40% of the time it's a far
// excursion — high and well beyond the island — so birds genuinely fly out of
// frame and circle back, the way real birds roam.
function roamTarget(out: THREE.Vector3) {
  const a = Math.random() * Math.PI * 2;
  if (Math.random() < 0.4) {
    const r = rand(22, 38);
    out.set(Math.cos(a) * r, rand(10, 22), Math.sin(a) * r);
  } else {
    const r = rand(7, 16);
    out.set(Math.cos(a) * r, rand(4.5, 11), Math.sin(a) * r);
  }
  return out;
}

export function Birds({ count = 7 }: { count?: number }) {
  const { scene: birdScene, animations } = useGLTF(BIRD);
  const { scene: treeScene } = useGLTF(TREE);

  const perches = useMemo(
    () => sampleBranchAnchors(treeScene, 14).map((a) => a.pos),
    [treeScene],
  );
  const occupied = useRef<Set<number>>(new Set());

  const birds = useMemo<Bird[]>(() => {
    occupied.current = new Set();
    return Array.from({ length: count }, () => {
      const obj = cloneSkeleton(birdScene);
      obj.scale.setScalar(BIRD_SCALE);
      const mixer = new THREE.AnimationMixer(obj);
      if (animations[0]) {
        const action = mixer.clipAction(animations[0]);
        action.play();
        action.time = Math.random() * 5;
      }
      const { chest, spine } = flapBones(obj);
      return {
        obj,
        mixer,
        pos: roamTarget(new THREE.Vector3()),
        vel: new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize().multiplyScalar(CRUISE_SPEED),
        target: roamTarget(new THREE.Vector3()),
        state: "cruise" as State,
        timer: rand(5, 12),
        perchIdx: -1,
        rot: new THREE.Euler(0, 0, 0, "YXZ"),
        flapPhase: Math.random() * Math.PI * 2,
        chest,
        spine,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [birdScene, animations, count]);

  useEffect(() => {
    return () => birds.forEach((b) => b.mixer.stopAllAction());
  }, [birds]);

  const wrappers = useRef<(THREE.Group | null)[]>([]);
  const tmpDir = new THREE.Vector3();
  const tmpSteer = new THREE.Vector3();

  const pickPerch = (b: Bird) => {
    const free: number[] = [];
    for (let i = 0; i < perches.length; i++) if (!occupied.current.has(i)) free.push(i);
    if (!free.length) return false;
    const idx = free[Math.floor(Math.random() * free.length)];
    occupied.current.add(idx);
    b.perchIdx = idx;
    b.target.copy(perches[idx]).add(new THREE.Vector3(0, 0.16, 0));
    b.state = "toPerch";
    return true;
  };

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const t = state.clock.elapsedTime;
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      const g = wrappers.current[i];
      if (!g) continue;

      const flying = b.state !== "perched";

      if (b.state === "perched") {
        b.timer -= dt;
        if (b.timer <= 0) {
          b.state = "launch";
          if (b.perchIdx >= 0) occupied.current.delete(b.perchIdx);
          b.perchIdx = -1;
          roamTarget(b.target);
          b.target.y = Math.max(b.target.y, b.pos.y + 3);
          b.timer = rand(6, 12);
        }
      } else {
        tmpDir.copy(b.target).sub(b.pos);
        const dist = tmpDir.length();
        tmpDir.normalize();

        const speed =
          b.state === "toPerch"
            ? THREE.MathUtils.clamp(dist * 1.8, 0.5, CRUISE_SPEED)
            : b.state === "launch"
              ? CRUISE_SPEED * 1.3
              : CRUISE_SPEED * rand(0.92, 1.12);

        tmpSteer.copy(tmpDir).multiplyScalar(speed).sub(b.vel);
        b.vel.addScaledVector(tmpSteer, Math.min(1, TURN_RATE * dt));
        b.pos.addScaledVector(b.vel, dt);

        if (b.state === "cruise") {
          if (dist < 2.5) roamTarget(b.target);
          b.timer -= dt;
          if (b.timer <= 0 && !pickPerch(b)) b.timer = rand(4, 8);
        } else if (b.state === "launch") {
          if (dist < 3) {
            b.state = "cruise";
            b.timer = rand(6, 13);
          }
        } else if (b.state === "toPerch" && dist < 0.25) {
          b.pos.copy(b.target);
          b.vel.setScalar(0);
          b.state = "perched";
          b.timer = rand(5, 11);
        }
      }

      // orientation: face travel, pitch with climb, bank into turns
      const sp = b.vel.length();
      if (sp > 0.05) {
        const yaw = Math.atan2(b.vel.x, b.vel.z) + MODEL_YAW;
        const pitch = -Math.asin(THREE.MathUtils.clamp(b.vel.y / sp, -1, 1)) * 0.7;
        let dyaw = yaw - b.rot.y;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        b.rot.y += dyaw * Math.min(1, dt * 6);
        b.rot.x += (pitch - b.rot.x) * Math.min(1, dt * 5);
        b.rot.z += (THREE.MathUtils.clamp(dyaw * 2.5, -0.6, 0.6) * -1 - b.rot.z) * Math.min(1, dt * 5);
      }

      // Play the model's OWN full-body clip (legs, tail, neck, head all move)
      // FIRST, then flap the wings by rotating the chest/spine the wings are
      // skinned to — a fast see-saw beat while flying, settling when perched.
      b.mixer.update(dt * (flying ? 1 : 0.85));

      const wave = Math.sin(t * (flying ? 9 : 2.2) + b.flapPhase);
      const amp = flying ? 0.22 : 0.04;
      if (b.chest) b.chest.rotation.z += wave * amp;
      if (b.spine) b.spine.rotation.z += wave * amp * 0.5;

      // vertical body bob synced to the wing-beat
      g.position.set(b.pos.x, b.pos.y + (flying ? wave * 0.08 : 0), b.pos.z);
      g.rotation.copy(b.rot);
    }
  });

  return (
    <group>
      {birds.map((b, i) => (
        <group
          key={i}
          ref={(g) => {
            wrappers.current[i] = g;
          }}
        >
          <primitive object={b.obj} />
        </group>
      ))}
    </group>
  );
}

useGLTF.preload(BIRD);
