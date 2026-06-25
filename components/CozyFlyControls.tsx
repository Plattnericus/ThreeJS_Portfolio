"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const EULER_ORDER = "YXZ";
const PITCH_LIMIT = Math.PI / 2 - 0.08;

export function CozyFlyControls({
  speed = 8,
  lookSpeed = 0.0022,
}: {
  speed?: number;
  lookSpeed?: number;
}) {
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const dragging = useRef(false);
  const yaw = useRef(0);
  const pitch = useRef(0);
  const velocity = useRef(new THREE.Vector3());
  const targetVelocity = useRef(new THREE.Vector3());
  const euler = useRef(new THREE.Euler(0, 0, 0, EULER_ORDER));
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const up = useRef(new THREE.Vector3(0, 1, 0));

  useEffect(() => {
    euler.current.setFromQuaternion(camera.quaternion, EULER_ORDER);
    pitch.current = euler.current.x;
    yaw.current = euler.current.y;
  }, [camera]);

  useEffect(() => {
    const el = gl.domElement;

    const onKeyDown = (event: KeyboardEvent) => {
      keys.current.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keys.current.delete(event.code);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      dragging.current = true;
      el.setPointerCapture?.(event.pointerId);
    };
    const onPointerUp = (event: PointerEvent) => {
      dragging.current = false;
      el.releasePointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging.current) return;
      yaw.current -= event.movementX * lookSpeed;
      pitch.current -= event.movementY * lookSpeed;
      pitch.current = THREE.MathUtils.clamp(pitch.current, -PITCH_LIMIT, PITCH_LIMIT);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointermove", onPointerMove);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [gl, lookSpeed]);

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    const k = 1 - Math.exp(-d * 8);
    const key = keys.current;

    euler.current.set(pitch.current, yaw.current, 0, EULER_ORDER);
    camera.quaternion.slerp(new THREE.Quaternion().setFromEuler(euler.current), k);

    forward.current.set(0, 0, -1).applyEuler(new THREE.Euler(0, yaw.current, 0));
    right.current.set(1, 0, 0).applyEuler(new THREE.Euler(0, yaw.current, 0));
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

    velocity.current.lerp(targetVelocity.current, 1 - Math.exp(-d * 5.5));
    camera.position.addScaledVector(velocity.current, d);
  });

  return null;
}
