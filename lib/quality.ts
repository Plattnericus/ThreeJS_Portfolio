"use client";

// Central graphics-quality config. EVERY performance/visual knob lives here so
// components never hardcode counts: they read the active profile from
// QualityContext (provided inside the Canvas in Experience.tsx).
//
// Tier goals:
//   low     — weak mobiles hold 60fps: small shadows, few particles/agents.
//   medium  — mid laptops/tablets.
//   high    — strong laptops/desktops with bloom but proxy canopy shadows.
//   extreme — opt-in only (auto-detect never picks it): densest smooth preset,
//             still capped to proxy canopy shadows. PerformanceMonitor still
//             scales DPR down if the GPU can't keep up.

import { createContext, useContext } from "react";

export type ResolvedGraphicsQuality = "low" | "medium" | "high" | "extreme" | "ultra";
export type GraphicsQuality = "auto" | ResolvedGraphicsQuality;

export const GRAPHICS_OPTIONS: GraphicsQuality[] = [
  "auto",
  "low",
  "medium",
  "high",
  "extreme",
  "ultra",
];

export type QualityProfile = {
  // Adaptive resolution
  minDpr: number;
  idleDpr: number;
  maxDpr: number;
  movingDpr: number;
  antialias: boolean;
  // Volumetric clouds
  idleCloudQuality: number;
  movingCloudQuality: number;
  cloudLayers: 1 | 2 | 3;
  cloudMaxSteps: number;
  // Shadows
  shadowMapSize: number;
  shadowType: "pcf" | "pcfsoft";
  leafShadows: "proxy" | "real"; // crown shadow: cheap ellipsoid vs real alpha-tested leaves
  canopySelfShadow: boolean; // canopy receives its own dappled shadows (extreme)
  // Vegetation
  grassBlades: number;
  grassTufts: number;
  sprigDensity: number; // canopy leaf-sprig multiplier
  canopyBudgetScale: number; // scales twig/shell budgets — density stays size-stable
  leafAtlasSize: number; // procedural leaf-card atlas resolution
  barkTexSize: number; // procedural bark texture resolution
  bushes: number;
  flowers: number;
  // Sky
  stars: number;
  // Particles
  rainMax: number;
  snowMax: number;
  fireflies: number;
  fallingLeaves: number;
  // Villagers (heaviest CPU loop: skinned clones + mixers)
  antsPerHouse: number;
  antsTrunk: number;
  antMixerStride: number; // update skinned animations every Nth frame
  // Post
  bloom: boolean; // subtle filmic bloom (lanterns, sun, fireflies)
  postprocessingSamples: 0 | 2 | 4; // MSAA samples for postprocessing render targets
  // 2D extras
  vignette: boolean;
  // Cinematic (opt-in RDR2/BSL stack) — cheap flags on auto tiers, heavy on ultra
  smaa: boolean; // morphological anti-aliasing pass (edge AA)
  aerial: number; // aerial-perspective strength 0..1 (sun-aware distance haze)
  ao: boolean; // N8AO ambient occlusion (contact darkening)
  godRays: boolean; // volumetric light shafts on the sun disc
  grade: boolean; // filmic split-tone color grade
};

export const QUALITY_PROFILES: Record<ResolvedGraphicsQuality, QualityProfile> = {
  low: {
    minDpr: 0.72,
    idleDpr: 0.9,
    maxDpr: 1.05,
    movingDpr: 0.88,
    antialias: false,
    idleCloudQuality: 0.26,
    movingCloudQuality: 0.05,
    cloudLayers: 1,
    cloudMaxSteps: 10,
    shadowMapSize: 512,
    shadowType: "pcf",
    leafShadows: "proxy",
    canopySelfShadow: false,
    grassBlades: 11000,
    grassTufts: 0,
    sprigDensity: 0.75,
    canopyBudgetScale: 0.55,
    leafAtlasSize: 512,
    barkTexSize: 512,
    bushes: 55,
    flowers: 130,
    stars: 160,
    rainMax: 500,
    snowMax: 280,
    fireflies: 16,
    fallingLeaves: 35,
    antsPerHouse: 2,
    antsTrunk: 10,
    antMixerStride: 2,
    bloom: false,
    postprocessingSamples: 0,
    vignette: false,
    smaa: false,
    aerial: 0,
    ao: false,
    godRays: false,
    grade: false,
  },
  medium: {
    minDpr: 0.9,
    idleDpr: 1.25,
    maxDpr: 1.4,
    movingDpr: 1.32,
    antialias: false,
    idleCloudQuality: 0.42,
    movingCloudQuality: 0.08,
    cloudLayers: 2,
    cloudMaxSteps: 12,
    shadowMapSize: 1024,
    shadowType: "pcf",
    leafShadows: "proxy",
    canopySelfShadow: false,
    grassBlades: 20000,
    grassTufts: 1,
    sprigDensity: 0.95,
    canopyBudgetScale: 0.72,
    leafAtlasSize: 512,
    barkTexSize: 512,
    bushes: 95,
    flowers: 260,
    stars: 320,
    rainMax: 800,
    snowMax: 450,
    fireflies: 24,
    fallingLeaves: 55,
    antsPerHouse: 2,
    antsTrunk: 12,
    antMixerStride: 2,
    bloom: false,
    postprocessingSamples: 0,
    vignette: false,
    smaa: false,
    aerial: 0.35,
    ao: false,
    godRays: false,
    grade: false,
  },
  high: {
    minDpr: 1.0,
    idleDpr: 1.5,
    maxDpr: 1.7,
    movingDpr: 1.6,
    antialias: true,
    idleCloudQuality: 0.54,
    movingCloudQuality: 0.1,
    cloudLayers: 2,
    cloudMaxSteps: 14,
    shadowMapSize: 1024,
    shadowType: "pcfsoft",
    leafShadows: "proxy",
    canopySelfShadow: false,
    grassBlades: 28000,
    grassTufts: 1,
    sprigDensity: 1.2,
    canopyBudgetScale: 0.92,
    leafAtlasSize: 1024,
    barkTexSize: 1024,
    bushes: 130,
    flowers: 420,
    stars: 560,
    rainMax: 1200,
    snowMax: 700,
    fireflies: 36,
    fallingLeaves: 85,
    antsPerHouse: 3,
    antsTrunk: 18,
    antMixerStride: 2,
    bloom: true,
    postprocessingSamples: 2,
    vignette: false,
    smaa: true,
    aerial: 0.55,
    ao: false,
    godRays: false,
    grade: true,
  },
  extreme: {
    minDpr: 1.05,
    idleDpr: 1.68,
    maxDpr: 1.9,
    movingDpr: 1.72,
    antialias: true,
    idleCloudQuality: 0.58,
    movingCloudQuality: 0.1,
    cloudLayers: 3,
    cloudMaxSteps: 15,
    shadowMapSize: 1024,
    shadowType: "pcfsoft",
    leafShadows: "proxy",
    canopySelfShadow: false,
    grassBlades: 36000,
    grassTufts: 1,
    sprigDensity: 1.28,
    canopyBudgetScale: 0.96,
    leafAtlasSize: 1024,
    barkTexSize: 1024,
    bushes: 160,
    flowers: 560,
    stars: 620,
    rainMax: 1300,
    snowMax: 760,
    fireflies: 40,
    fallingLeaves: 90,
    antsPerHouse: 3,
    antsTrunk: 20,
    antMixerStride: 2,
    bloom: true,
    postprocessingSamples: 2,
    vignette: true,
    smaa: true,
    aerial: 0.85,
    ao: true,
    godRays: true,
    grade: true,
  },
  ultra: {
    minDpr: 1.25,
    idleDpr: 2.0,
    maxDpr: 2.0,
    movingDpr: 1.85,
    antialias: true,
    idleCloudQuality: 0.62,
    movingCloudQuality: 0.12,
    cloudLayers: 3,
    cloudMaxSteps: 18,
    shadowMapSize: 2048,
    shadowType: "pcfsoft",
    leafShadows: "real",
    canopySelfShadow: true,
    grassBlades: 44000,
    grassTufts: 1,
    sprigDensity: 1.4,
    canopyBudgetScale: 1.05,
    leafAtlasSize: 2048,
    barkTexSize: 2048,
    bushes: 190,
    flowers: 640,
    stars: 700,
    rainMax: 1500,
    snowMax: 850,
    fireflies: 46,
    fallingLeaves: 100,
    antsPerHouse: 3,
    antsTrunk: 22,
    antMixerStride: 1,
    bloom: true,
    postprocessingSamples: 4,
    vignette: true,
    smaa: true,
    aerial: 1.0,
    ao: true,
    godRays: true,
    grade: true,
  },
};

export function isGraphicsQuality(value: string | null): value is GraphicsQuality {
  return (
    value === "auto" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "extreme" ||
    value === "ultra"
  );
}

export const QualityContext = createContext<QualityProfile>(QUALITY_PROFILES.high);

/** Active quality profile — available anywhere inside the Canvas. */
export function useQualityProfile(): QualityProfile {
  return useContext(QualityContext);
}
