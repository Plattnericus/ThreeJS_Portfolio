"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const EULER_ORDER = "YXZ";
const PITCH_LIMIT = Math.PI / 2 - 0.08;
const MOVE_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyR",
  "KeyF",
  "Space",
  "ShiftLeft",
  "ShiftRight",
]);

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

export function CozyFlyControls({
  speed = 8,
  lookSpeed = 0.0019,
}: {
  speed?: number;
  lookSpeed?: number;
}) {
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const dragging = useRef(false);
  const pointerLocked = useRef(false);
  const yaw = useRef(0);
  const pitch = useRef(0);
  const smoothYaw = useRef(0);
  const smoothPitch = useRef(0);
  const lookDelta = useRef({ x: 0, y: 0 });
  const velocity = useRef(new THREE.Vector3());
  const targetVelocity = useRef(new THREE.Vector3());
  const euler = useRef(new THREE.Euler(0, 0, 0, EULER_ORDER));
  const yawEuler = useRef(new THREE.Euler(0, 0, 0, EULER_ORDER));
  const targetQuaternion = useRef(new THREE.Quaternion());
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const up = useRef(new THREE.Vector3(0, 1, 0));

  useEffect(() => {
    euler.current.setFromQuaternion(camera.quaternion, EULER_ORDER);
    pitch.current = euler.current.x;
    yaw.current = euler.current.y;
    smoothPitch.current = pitch.current;
    smoothYaw.current = yaw.current;
  }, [camera]);

  useEffect(() => {
    const el = gl.domElement;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (MOVE_KEYS.has(event.code)) event.preventDefault();
      keys.current.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keys.current.delete(event.code);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      dragging.current = true;
      if (event.pointerType === "mouse") {
        el.requestPointerLock?.();
      } else {
        el.setPointerCapture?.(event.pointerId);
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!pointerLocked.current) dragging.current = false;
      if (event.pointerType !== "mouse") el.releasePointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging.current || pointerLocked.current) return;
      lookDelta.current.x += event.movementX;
      lookDelta.current.y += event.movementY;
    };
    const onMouseMove = (event: MouseEvent) => {
      if (!pointerLocked.current) return;
      lookDelta.current.x += event.movementX;
      lookDelta.current.y += event.movementY;
    };
    const onPointerLockChange = () => {
      pointerLocked.current = document.pointerLockElement === el;
      dragging.current = pointerLocked.current;
      if (!pointerLocked.current) {
        lookDelta.current.x = 0;
        lookDelta.current.y = 0;
      }
    };
    const onBlur = () => {
      keys.current.clear();
      dragging.current = false;
      pointerLocked.current = false;
      lookDelta.current.x = 0;
      lookDelta.current.y = 0;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointermove", onPointerMove);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
      if (document.pointerLockElement === el) document.exitPointerLock?.();
      document.body.style.cursor = "auto";
    };
  }, [gl, lookSpeed]);

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    const key = keys.current;

    if (lookDelta.current.x || lookDelta.current.y) {
      yaw.current -= lookDelta.current.x * lookSpeed;
      pitch.current = THREE.MathUtils.clamp(
        pitch.current - lookDelta.current.y * lookSpeed,
        -PITCH_LIMIT,
        PITCH_LIMIT,
      );
      lookDelta.current.x = 0;
      lookDelta.current.y = 0;
    }

    const lookK = 1 - Math.exp(-d * 34);
    smoothYaw.current += (yaw.current - smoothYaw.current) * lookK;
    smoothPitch.current += (pitch.current - smoothPitch.current) * lookK;

    euler.current.set(smoothPitch.current, smoothYaw.current, 0, EULER_ORDER);
    targetQuaternion.current.setFromEuler(euler.current);
    camera.quaternion.copy(targetQuaternion.current);

    yawEuler.current.set(0, smoothYaw.current, 0, EULER_ORDER);
    forward.current.set(0, 0, -1).applyEuler(yawEuler.current);
    right.current.set(1, 0, 0).applyEuler(yawEuler.current);
    targetVelocity.current.set(0, 0, 0);

    if (key.has("KeyW") || key.has("ArrowUp")) targetVelocity.current.add(forward.current);
    if (key.has("KeyS") || key.has("ArrowDown")) targetVelocity.current.sub(forward.current);
    if (key.has("KeyD") || key.has("ArrowRight")) targetVelocity.current.add(right.current);
    if (key.has("KeyA") || key.has("ArrowLeft")) targetVelocity.current.sub(right.current);
    if (key.has("KeyR") || key.has("Space")) targetVelocity.current.add(up.current);
    if (key.has("KeyF") || key.has("ShiftLeft") || key.has("ShiftRight")) {
      targetVelocity.current.sub(up.current);
    }

    if (targetVelocity.current.lengthSq() > 0) {
      targetVelocity.current.normalize().multiplyScalar(speed);
    }

    velocity.current.lerp(targetVelocity.current, 1 - Math.exp(-d * 9));
    camera.position.addScaledVector(velocity.current, d);
  });

  return null;
}
