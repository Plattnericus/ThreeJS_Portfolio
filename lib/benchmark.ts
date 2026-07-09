"use client";

import * as THREE from "three";
import type { ResolvedGraphicsQuality } from "./quality";

// Replaces a static cores/memory guess with a real, cheap in-browser probe: a
// small hidden canvas renders an instanced, wind-shaded quad field (the same
// cost shape as the real grass material — per-instance sway math + a noisy
// fragment) for a bounded time budget, and the MEDIAN frame time picks the
// tier. Falls back to the static heuristic whenever the probe can't produce a
// trustworthy signal — most importantly when `document.hidden` suppresses
// requestAnimationFrame entirely (confirmed: an automated/backgrounded tab
// hangs forever waiting on rAF), so this can NEVER hang the caller.

const INSTANCE_COUNT = 6000;
const WARMUP_FRAMES = 3;
const MAX_SAMPLES = 20;
const SAMPLE_BUDGET_MS = 350;
const HARD_TIMEOUT_MS = 800; // setTimeout-based, independent of rAF ever firing

const VERTEX = /* glsl */ `
  attribute float aPhase;
  varying float vY;
  void main() {
    vY = position.y;
    vec3 p = position;
    float sway = sin(aPhase + position.y * 3.0) * position.y * 0.12;
    p.x += sway;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  precision mediump float;
  varying float vY;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    float n = hash(gl_FragCoord.xy * 0.7) * 0.5 + hash(gl_FragCoord.xy * 1.9) * 0.5;
    vec3 col = mix(vec3(0.1, 0.25, 0.08), vec3(0.55, 0.7, 0.3), vY * 0.5 + n * 0.15);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function heuristicFallback(): ResolvedGraphicsQuality {
  if (typeof navigator === "undefined") return "medium";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const narrow =
    typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) < 820;
  const touchFirst = navigator.maxTouchPoints > 1 && narrow;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = nav.deviceMemory ?? (touchFirst ? 4 : 8);
  if (touchFirst || cores <= 4 || memory <= 4) return "low";
  if (cores >= 8 && memory >= 8 && typeof window !== "undefined" && window.innerWidth >= 1280) {
    return "high";
  }
  return "medium";
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function classify(medianFrameMs: number): ResolvedGraphicsQuality {
  // Thresholds are deliberately conservative: this probe only measures a
  // simplified wind-shaded quad field, not the real scene's full stack
  // (shadows, canopy, clouds, ants together) — erring toward a LOWER default
  // tier for a borderline device is much safer than an optimistic guess that
  // turns out laggy once everything is actually running.
  if (medianFrameMs < 6) return "high";
  if (medianFrameMs < 11) return "medium";
  return "low";
}

async function probe(): Promise<ResolvedGraphicsQuality | null> {
  if (typeof document === "undefined" || typeof window === "undefined") return null;
  if (document.hidden) return null; // rAF would never fire — bail immediately

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  canvas.style.cssText = "position:fixed;left:0;top:0;opacity:0;pointer-events:none;z-index:-1;";
  document.body.appendChild(canvas);

  let renderer: THREE.WebGLRenderer | null = null;
  const cleanup = (geo?: THREE.BufferGeometry, mat?: THREE.Material) => {
    geo?.dispose();
    mat?.dispose();
    renderer?.dispose();
    canvas.remove();
  };

  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(256, 256, false);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 50);
    camera.position.set(0, 2, 8);
    camera.lookAt(0, 0, 0);

    const scene = new THREE.Scene();
    const geo = new THREE.PlaneGeometry(0.1, 1, 1, 3);
    geo.translate(0, 0.5, 0);
    const phases = new Float32Array(INSTANCE_COUNT);
    for (let i = 0; i < INSTANCE_COUNT; i++) phases[i] = Math.random() * Math.PI * 2;
    geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));

    const mat = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT });
    const mesh = new THREE.InstancedMesh(geo, mat, INSTANCE_COUNT);
    const tmp = new THREE.Object3D();
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      tmp.position.set((Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 12 - 4);
      tmp.rotation.y = Math.random() * Math.PI;
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    }
    scene.add(mesh);

    const deltas: number[] = [];
    let frame = 0;
    const start = performance.now();

    await new Promise<void>((resolve) => {
      let last = performance.now();
      function tick() {
        const now = performance.now();
        const dt = now - last;
        last = now;
        frame++;
        if (frame > WARMUP_FRAMES) deltas.push(dt);
        renderer!.render(scene, camera);
        if (
          now - start >= SAMPLE_BUDGET_MS ||
          deltas.length >= MAX_SAMPLES ||
          document.hidden
        ) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });

    cleanup(geo, mat);
    if (deltas.length < 5) return null; // inconclusive — not enough real samples
    return classify(median(deltas));
  } catch {
    cleanup();
    return null;
  }
}

export async function runGraphicsBenchmark(): Promise<ResolvedGraphicsQuality> {
  const fallback = heuristicFallback();
  // Hard floors the benchmark can't see (CPU-bound costs like skinned ants) —
  // always win regardless of what the GPU probe measures.
  if (fallback === "low") return "low";

  const result = await Promise.race([
    probe(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), HARD_TIMEOUT_MS)),
  ]).catch(() => null);

  return result ?? fallback;
}
