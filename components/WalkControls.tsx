"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { sampleIslandSurface } from "@/lib/surface";
import { bonsaiNodes } from "@/lib/bonsai";
import { deckRadius } from "@/lib/rarity";
import type { Stargazer } from "@/lib/stargazers";

// First-person WALK explorer: pointer-lock mouse-look + WASD, gravity + jump,
// cheap ground collision against the island's radial height profile AND the house
// decks (so you can stand on them). Near the tree you CLIMB by looking up/down +
// W (reach the houses). You can't fall off the island (soft wall at the edge).
// Entering walk plays a short cinematic that eases in toward the founder house.

const EULER_ORDER = "YXZ";
const PITCH_LIMIT = Math.PI / 2 - 0.08;
const ISLAND_SCALE = 0.8; // must match Experience.ISLAND_SCALE
const TREE_Y = 7.35 * ISLAND_SCALE; // must match Experience.TREE_Y
const TREE_BOOST = 1.15; // must match Experience.TREE_BOOST
const EYE = 2.4;
const GRAVITY = 26;
const JUMP = 9;
const STEP = 0.75; // max height you can step up onto a deck
const CLIMB_R = 9.5; // horizontal radius around the trunk where you can climb
const CLIMB_SPEED = 5.2;
const INTRO_SECONDS = 3.4;

const MOVE_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Space", "ShiftLeft", "ShiftRight",
]);

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

type Deck = { x: number; z: number; y: number; r: number };

export function WalkControls({
  speed = 6,
  lookSpeed = 0.0019,
  stars = 0,
  stargazers = null,
}: {
  speed?: number;
  lookSpeed?: number;
  stars?: number;
  stargazers?: Stargazer[] | null;
}) {
  const { camera, gl } = useThree();
  const { scene } = useGLTF("/models/island.glb");
  const surface = useMemo(() => sampleIslandSurface(scene, ISLAND_SCALE), [scene]);

  // House decks in WORLD space (same transform as Experience's Tree group).
  const decks = useMemo<Deck[]>(() => {
    const count = Math.max(0, Math.floor(stars));
    return bonsaiNodes(count).map((n, i) => ({
      x: n.tip.x * TREE_BOOST,
      z: n.tip.z * TREE_BOOST,
      y: TREE_Y + (n.tip.y + 0.35) * TREE_BOOST,
      r: deckRadius(i, stargazers) * TREE_BOOST,
    }));
  }, [stars, stargazers]);

  const clampR = useMemo(() => {
    let m = surface.edgeR + 0.5;
    for (const d of decks) m = Math.max(m, Math.hypot(d.x, d.z) + d.r);
    return Math.max(m, 9.5);
  }, [decks, surface]);

  const keys = useRef(new Set<string>());
  const dragging = useRef(false);
  const pointerLocked = useRef(false);
  const yaw = useRef(0);
  const pitch = useRef(0);
  const smoothYaw = useRef(0);
  const smoothPitch = useRef(0);
  const lookDelta = useRef({ x: 0, y: 0 });
  const vy = useRef(0);
  const euler = useRef(new THREE.Euler(0, 0, 0, EULER_ORDER));
  const yawEuler = useRef(new THREE.Euler(0, 0, 0, EULER_ORDER));
  const quat = useRef(new THREE.Quaternion());
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const move = useRef(new THREE.Vector3());

  // Cinematic intro toward the founder (first stargazer) house.
  const introT = useRef(0);
  const introing = useRef(true);
  const introStart = useRef(new THREE.Vector3());
  const introTarget = useRef(new THREE.Vector3());
  const spawnPos = useRef(new THREE.Vector3());

  const groundTopAt = (x: number, z: number, feetY: number) => {
    const r = Math.hypot(x, z);
    let top = r <= surface.edgeR + 0.5 ? surface.heightAt(Math.min(r, surface.edgeR)) : -Infinity;
    for (const d of decks) {
      if (Math.hypot(x - d.x, z - d.z) <= d.r && d.y <= feetY + STEP) top = Math.max(top, d.y);
    }
    return top;
  };

  const setup = () => {
    const dev = decks[0];
    if (dev) {
      // stand a little outside the founder house, on the ground, looking up at it
      const dr = Math.hypot(dev.x, dev.z) || 1;
      const k = Math.min((dr + 2.4) / dr, (surface.edgeR - 0.5) / dr);
      const sx = dev.x * k;
      const sz = dev.z * k;
      spawnPos.current.set(sx, surface.heightAt(Math.min(Math.hypot(sx, sz), surface.edgeR)) + EYE, sz);
      introTarget.current.set(dev.x, dev.y + 0.6, dev.z);
      // establishing shot: high, pulled further out beyond the house
      introStart.current.set(dev.x * (k + 1.15), dev.y + 7.5, dev.z * (k + 1.15));
    } else {
      const g = surface.heightAt(0) + EYE;
      spawnPos.current.set(0, g, Math.min(surface.edgeR * 0.8, 6));
      introTarget.current.set(0, TREE_Y + 6, 0);
      introStart.current.set(0, g + 9, Math.min(surface.edgeR, 9));
    }
    camera.position.copy(introStart.current);
    camera.lookAt(introTarget.current);
    introT.current = 0;
    introing.current = true;
    vy.current = 0;
  };

  useEffect(() => {
    setup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = gl.domElement;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (MOVE_KEYS.has(e.code)) e.preventDefault();
      if (introing.current) introing.current = false; // any key skips the intro
      keys.current.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      dragging.current = true;
      if (e.pointerType === "mouse") el.requestPointerLock?.();
      else el.setPointerCapture?.(e.pointerId);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!pointerLocked.current) dragging.current = false;
      if (e.pointerType !== "mouse") el.releasePointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging.current || pointerLocked.current) return;
      lookDelta.current.x += e.movementX;
      lookDelta.current.y += e.movementY;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!pointerLocked.current) return;
      lookDelta.current.x += e.movementX;
      lookDelta.current.y += e.movementY;
    };
    const onLockChange = () => {
      pointerLocked.current = document.pointerLockElement === el;
      dragging.current = pointerLocked.current;
      if (!pointerLocked.current) lookDelta.current = { x: 0, y: 0 };
    };
    const onBlur = () => {
      keys.current.clear();
      dragging.current = false;
      pointerLocked.current = false;
      lookDelta.current = { x: 0, y: 0 };
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onLockChange);
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointermove", onPointerMove);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onLockChange);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
      if (document.pointerLockElement === el) document.exitPointerLock?.();
    };
  }, [gl]);

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);

    // ---- Cinematic intro: ease from the establishing shot to the spawn ----
    if (introing.current) {
      introT.current += d / INTRO_SECONDS;
      const t = THREE.MathUtils.smoothstep(Math.min(1, introT.current), 0, 1);
      camera.position.lerpVectors(introStart.current, spawnPos.current, t);
      camera.lookAt(introTarget.current);
      if (introT.current >= 1) {
        introing.current = false;
        euler.current.setFromQuaternion(camera.quaternion, EULER_ORDER);
        yaw.current = smoothYaw.current = euler.current.y;
        pitch.current = smoothPitch.current = euler.current.x;
        vy.current = 0;
      }
      return;
    }

    const key = keys.current;

    // ---- look ----
    if (lookDelta.current.x || lookDelta.current.y) {
      yaw.current -= lookDelta.current.x * lookSpeed;
      pitch.current = THREE.MathUtils.clamp(
        pitch.current - lookDelta.current.y * lookSpeed,
        -PITCH_LIMIT,
        PITCH_LIMIT,
      );
      lookDelta.current = { x: 0, y: 0 };
    }
    const lookK = 1 - Math.exp(-d * 34);
    smoothYaw.current += (yaw.current - smoothYaw.current) * lookK;
    smoothPitch.current += (pitch.current - smoothPitch.current) * lookK;
    euler.current.set(smoothPitch.current, smoothYaw.current, 0, EULER_ORDER);
    camera.quaternion.copy(quat.current.setFromEuler(euler.current));

    const fwdPressed = key.has("KeyW") || key.has("ArrowUp");
    const backPressed = key.has("KeyS") || key.has("ArrowDown");
    const r = Math.hypot(camera.position.x, camera.position.z);

    // ---- climb: near the trunk, look up/down + W to go up/down (ladders) ----
    let climbing = false;
    if (r < CLIMB_R && (fwdPressed || backPressed)) {
      const dir = fwdPressed ? 1 : -1;
      if (smoothPitch.current > 0.28) {
        camera.position.y += CLIMB_SPEED * d * dir;
        vy.current = 0;
        climbing = true;
      } else if (smoothPitch.current < -0.28) {
        camera.position.y -= CLIMB_SPEED * d * dir;
        vy.current = 0;
        climbing = true;
      }
    }

    // ---- horizontal move (yaw-only) — suppressed while climbing ----
    if (!climbing) {
      yawEuler.current.set(0, smoothYaw.current, 0, EULER_ORDER);
      forward.current.set(0, 0, -1).applyEuler(yawEuler.current);
      right.current.set(1, 0, 0).applyEuler(yawEuler.current);
      move.current.set(0, 0, 0);
      if (fwdPressed) move.current.add(forward.current);
      if (backPressed) move.current.sub(forward.current);
      if (key.has("KeyD") || key.has("ArrowRight")) move.current.add(right.current);
      if (key.has("KeyA") || key.has("ArrowLeft")) move.current.sub(right.current);
      if (move.current.lengthSq() > 0) {
        move.current.y = 0;
        move.current.normalize().multiplyScalar(speed * d);
        camera.position.x += move.current.x;
        camera.position.z += move.current.z;
      }
    }

    // ---- gravity + ground collision (island + decks) ----
    if (!climbing) {
      const feet = camera.position.y - EYE;
      const top = groundTopAt(camera.position.x, camera.position.z, feet);
      const groundEye = top + EYE;
      vy.current -= GRAVITY * d;
      camera.position.y += vy.current * d;
      let grounded = false;
      if (top > -Infinity && camera.position.y <= groundEye) {
        camera.position.y = groundEye;
        vy.current = 0;
        grounded = true;
      }
      if ((key.has("Space") || key.has("ShiftLeft")) && grounded) vy.current = JUMP;
      // never fall through the world — if somehow below all ground, sit on it
      if (top > -Infinity && camera.position.y < groundEye - 40) camera.position.y = groundEye;
    }

    // ---- no falling off the island: soft wall at the plateau/tree edge ----
    const rr = Math.hypot(camera.position.x, camera.position.z);
    if (rr > clampR) {
      const k = clampR / rr;
      camera.position.x *= k;
      camera.position.z *= k;
    }
  });

  return null;
}
