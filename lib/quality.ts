"use client";

// Central graphics-quality config. EVERY performance/visual knob lives here so
// components never hardcode counts: they read the active profile from
// QualityContext (provided inside the Canvas in Experience.tsx).
//
// Tier goals:
//   low     — weak mobiles hold 60fps: small shadows, few particles/agents.
//   medium  — mid laptops/tablets.
//   high    — strong laptops/desktops (previous ceiling + 2048 shadows).
//   extreme — opt-in only (auto-detect never picks it): max density, PCFSoft
//             4096 shadows, densest canopy/clouds. PerformanceMonitor still
//             scales DPR down if the GPU can't keep up.

import { createContext, useContext } from "react";

export type ResolvedGraphicsQuality = "low" | "medium" | "high" | "extreme";
export type GraphicsQuality = "auto" | ResolvedGraphicsQuality;

export const GRAPHICS_OPTIONS: GraphicsQuality[] = [
  "auto",
  "low",
  "medium",
  "high",
  "extreme",
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
  movingBloom: boolean; // keep bloom while the camera is moving
  // 2D extras
  vignette: boolean;
};

export const QUALITY_PROFILES: Record<ResolvedGraphicsQuality, QualityProfile> = {
  low: {
    minDpr: 0.72,
    idleDpr: 0.92,
    maxDpr: 1.05,
    movingDpr: 0.86,
    antialias: false,
    idleCloudQuality: 0.34,
    movingCloudQuality: 0.08,
    cloudLayers: 1,
    cloudMaxSteps: 12,
    shadowMapSize: 512,
    shadowType: "pcf",
    leafShadows: "proxy",
    canopySelfShadow: false,
    grassBlades: 12000,
    grassTufts: 0,
    sprigDensity: 1.0,
    canopyBudgetScale: 0.85,
    leafAtlasSize: 512,
    barkTexSize: 512,
    bushes: 70,
    flowers: 160,
    stars: 260,
    rainMax: 800,
    snowMax: 450,
    fireflies: 24,
    fallingLeaves: 60,
    antsPerHouse: 2,
    antsTrunk: 10,
    antMixerStride: 2,
    bloom: false,
    postprocessingSamples: 0,
    movingBloom: false,
    vignette: false,
  },
  medium: {
    minDpr: 0.9,
    idleDpr: 1.28,
    maxDpr: 1.45,
    movingDpr: 1.1,
    antialias: false,
    idleCloudQuality: 0.54,
    movingCloudQuality: 0.12,
    cloudLayers: 2,
    cloudMaxSteps: 15,
    shadowMapSize: 1024,
    shadowType: "pcf",
    leafShadows: "proxy",
    canopySelfShadow: false,
    grassBlades: 20000,
    grassTufts: 1,
    sprigDensity: 1.3,
    canopyBudgetScale: 1.0,
    leafAtlasSize: 512,
    barkTexSize: 512,
    bushes: 100,
    flowers: 240,
    stars: 560,
    rainMax: 1200,
    snowMax: 700,
    fireflies: 36,
    fallingLeaves: 90,
    antsPerHouse: 3,
    antsTrunk: 18,
    antMixerStride: 1,
    bloom: false,
    postprocessingSamples: 0,
    movingBloom: false,
    vignette: false,
  },
  high: {
    minDpr: 1.0,
    idleDpr: 1.5,
    maxDpr: 1.7,
    movingDpr: 1.22,
    antialias: true,
    idleCloudQuality: 0.68,
    movingCloudQuality: 0.12,
    cloudLayers: 3,
    cloudMaxSteps: 16,
    shadowMapSize: 2048,
    shadowType: "pcfsoft",
    leafShadows: "real",
    canopySelfShadow: false,
    grassBlades: 26000,
    grassTufts: 1,
    sprigDensity: 1.6,
    canopyBudgetScale: 1.2,
    leafAtlasSize: 1024,
    barkTexSize: 1024,
    bushes: 130,
    flowers: 320,
    stars: 900,
    rainMax: 1600,
    snowMax: 900,
    fireflies: 45,
    fallingLeaves: 110,
    antsPerHouse: 4,
    antsTrunk: 26,
    antMixerStride: 1,
    bloom: true,
    postprocessingSamples: 2,
    movingBloom: false,
    vignette: false,
  },
  extreme: {
    minDpr: 1.2,
    idleDpr: 1.9,
    maxDpr: 2.25,
    movingDpr: 1.5,
    antialias: true,
    idleCloudQuality: 0.95,
    movingCloudQuality: 0.2,
    cloudLayers: 3,
    cloudMaxSteps: 26,
    shadowMapSize: 4096,
    shadowType: "pcfsoft",
    leafShadows: "real",
    canopySelfShadow: true,
    grassBlades: 34000,
    grassTufts: 1,
    sprigDensity: 2.0,
    canopyBudgetScale: 1.45,
    leafAtlasSize: 1024,
    barkTexSize: 1024,
    bushes: 170,
    flowers: 420,
    stars: 1400,
    rainMax: 2200,
    snowMax: 1300,
    fireflies: 70,
    fallingLeaves: 150,
    antsPerHouse: 4,
    antsTrunk: 30,
    antMixerStride: 1,
    bloom: true,
    postprocessingSamples: 4,
    movingBloom: true,
    vignette: true,
  },
};

export function isGraphicsQuality(value: string | null): value is GraphicsQuality {
  return (
    value === "auto" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "extreme"
  );
}

export const QualityContext = createContext<QualityProfile>(QUALITY_PROFILES.high);

/** Active quality profile — available anywhere inside the Canvas. */
export function useQualityProfile(): QualityProfile {
  return useContext(QualityContext);
}
