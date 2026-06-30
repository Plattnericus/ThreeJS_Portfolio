// Weather model for the scene. Live mode mirrors Gossensass / Colle Isarco
// conditions as closely as Open-Meteo allows; demo/manual mode uses the same
// shape so render components never need a separate fake-weather path.

import * as THREE from "three";

export const GOSSENSASS = {
  lat: 46.93857,
  lon: 11.44245,
  tz: "Europe/Rome",
  place: "Gossensass / Colle Isarco, Gemeinde Brenner",
};

export type Precip = "none" | "rain" | "snow";
export type Sky = "clear" | "clouds" | "fog" | "rain" | "snow" | "storm";

export type Weather = {
  place?: string;
  tempC: number;
  apparentTempC?: number;
  humidity: number; // %
  pressureHpa: number;
  surfacePressureHpa?: number;
  precipMm: number;
  rainMm: number;
  snowfallCm: number;
  windKmh: number;
  gustKmh: number;
  windDeg?: number; // meteorological direction: wind comes FROM this bearing
  cloud: number; // 0..1 total cloud cover
  cloudLow: number; // 0..1
  cloudMid: number; // 0..1
  cloudHigh: number; // 0..1
  visibilityM: number;
  hour: number; // 0..24 local
  month?: number; // 0..11 (drives season); omitted = use today
  sky: Sky;
  live: boolean;
};

export type CloudLayerParams = {
  density: number; // 0..1, shader density
  coverage: number; // 0..1, actual meteo cover
  height: number;
  thickness: number;
  opacity: number;
  scale: number;
  speed: number;
  detail: number;
};

export type CloudSceneParams = {
  low: CloudLayerParams;
  mid: CloudLayerParams;
  high: CloudLayerParams;
  fog: number;
  visibilityM: number;
  baseColor: string;
  shadowColor: string;
};

// WMO weather_code -> our sky category.
export function skyFromCode(code: number): Sky {
  if (code >= 95) return "storm";
  if (code >= 71 && code <= 77) return "snow";
  if (code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code === 45 || code === 48) return "fog";
  if (code >= 2) return "clouds";
  return "clear";
}

export type Season = "spring" | "summer" | "autumn" | "winter";

export type SceneParams = {
  sunPos: [number, number, number];
  sunIntensity: number;
  sunColor: string;
  ambient: number;
  skyColor: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  wind: number; // sway multiplier
  gust: number; // short turbulence multiplier
  windKmh: number;
  gustKmh: number;
  windDeg: number; // meteorological direction: wind comes FROM this bearing
  windVec: [number, number]; // normalized scene-space direction the wind moves TO (x,z)
  precip: Precip;
  precipIntensity: number; // 0..1
  dayFactor: number; // 0 night .. 1 noon
  season: Season;
  leafColor: string; // seasonal foliage tint
  snow: number; // 0..1 accumulation on surfaces
  cloud: number; // 0..1 total cover
  clouds: CloudSceneParams;
  storm: boolean; // thunderstorm -> lightning
};

// Northern-hemisphere season from month (0-11).
export function seasonFromMonth(month: number): Season {
  if (month <= 1 || month === 11) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "autumn";
}

const LEAF_COLOR: Record<Season, string> = {
  spring: "#92d64e",
  summer: "#67bd38",
  autumn: "#e0892f",
  winter: "#9fb0a6",
};

const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;

function pct(n: number | undefined, fallback = 0): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return clamp(n / 100, 0, 1);
}

function finite(n: number | undefined, fallback: number): number {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

export function normalizeWindDeg(deg: number | undefined): number {
  if (typeof deg !== "number" || !Number.isFinite(deg)) return 235;
  return ((deg % 360) + 360) % 360;
}

// Open-Meteo reports meteorological direction (where wind comes FROM). Scene
// motion needs the downwind direction (where particles/clouds/branches move TO).
// Scene convention: +X east, +Z north.
export function windVectorFromDirection(fromDeg: number | undefined): [number, number] {
  const to = ((normalizeWindDeg(fromDeg) + 180) % 360) * THREE.MathUtils.DEG2RAD;
  const x = Math.sin(to);
  const z = Math.cos(to);
  const len = Math.hypot(x, z) || 1;
  return [x / len, z / len];
}

function sunFromHour(hour: number): { pos: [number, number, number]; day: number } {
  const t = clamp((hour - 5.5) / 14, 0, 1);
  const elev = Math.sin(t * Math.PI);
  const day = clamp(elev, 0, 1);
  const az = lerp(-1, 1, t);
  return { pos: [az * 30, 6 + elev * 28, 14], day };
}

function cloudLayer(
  coverage: number,
  height: number,
  thickness: number,
  scale: number,
  windKmh: number,
  detail: number,
): CloudLayerParams {
  const cover = clamp(coverage, 0, 1);
  return {
    coverage: cover,
    density: clamp(Math.pow(cover, 1.35), 0, 1),
    height,
    thickness,
    opacity: clamp(0.1 + cover * 0.88, 0, 0.96),
    scale,
    speed: lerp(0.015, 0.1, clamp(windKmh / 55, 0, 1)),
    detail,
  };
}

/** Build realistic scene params from a weather reading. */
export function sceneFromWeather(w: Weather): SceneParams {
  const { pos, day } = sunFromHour(w.hour);
  const humidity = finite(w.humidity, 55);
  const visibilityM = Math.max(100, finite(w.visibilityM, 40000));
  const totalCloud = clamp(finite(w.cloud, 0.2), 0, 1);
  const lowCloud = clamp(finite(w.cloudLow, totalCloud * 0.35), 0, 1);
  const midCloud = clamp(finite(w.cloudMid, totalCloud * 0.55), 0, 1);
  const highCloud = clamp(finite(w.cloudHigh, totalCloud * 0.45), 0, 1);
  const windKmh = Math.max(0, finite(w.windKmh, 0));
  const gustKmh = Math.max(windKmh, finite(w.gustKmh, windKmh));
  const windDeg = normalizeWindDeg(w.windDeg);
  const windVec = windVectorFromDirection(windDeg);
  const gust = clamp((gustKmh - windKmh) / 28, 0, 1.25);

  // Realistic amplitude: no drama multiplier, just enough normalized strength
  // for shaders to read actual mountain-valley wind.
  const wind = clamp(windKmh / 18, 0.06, 2.4);

  const rainy = w.sky === "rain" || w.sky === "storm";
  const snowy = w.sky === "snow" || finite(w.snowfallCm, 0) > 0;
  const precipAmount = finite(w.precipMm, 0) + finite(w.rainMm, 0) + finite(w.snowfallCm, 0) * 1.2;
  const fog = clamp(
    Math.max(
      w.sky === "fog" ? 0.85 : 0,
      (12000 - visibilityM) / 10500,
      humidity > 92 && lowCloud > 0.55 ? lowCloud * 0.55 : 0,
    ),
    0,
    1,
  );

  let precip: Precip = "none";
  let precipIntensity = 0;
  if (rainy) {
    precip = "rain";
    precipIntensity = clamp(0.22 + precipAmount * 0.45 + (w.sky === "storm" ? 0.28 : 0), 0.18, 1);
  } else if (snowy) {
    precip = "snow";
    precipIntensity = clamp(0.22 + finite(w.snowfallCm, 0) * 0.75, 0.18, 0.9);
  }

  const season = seasonFromMonth(w.month ?? new Date().getMonth());
  const snow = snowy ? 0.9 : season === "winter" ? 0.35 : 0;

  const nightSky = new THREE.Color("#111827");
  const daySky = new THREE.Color("#7cbde4");
  const overcast = new THREE.Color("#9fa8ad");
  const rainSky = new THREE.Color(w.sky === "storm" ? "#283044" : "#5f7180");
  let sky = nightSky.clone().lerp(daySky, day);
  sky.lerp(overcast, clamp(totalCloud * 0.52 + fog * 0.38, 0, 0.86));
  const rainMood = rainy ? clamp(0.42 + precipIntensity * 0.45 + (w.sky === "storm" ? 0.18 : 0), 0, 0.95) : 0;
  sky.lerp(rainSky, rainMood);

  const cloudShadow = clamp(totalCloud * 0.58 + lowCloud * 0.22 + fog * 0.35 + rainMood * 0.28, 0, 0.98);
  const sunIntensity = lerp(0.12, 2.05, day) * lerp(1, 0.36, cloudShadow) * lerp(1, 0.68, rainMood);
  const sunColor = day < 0.25 ? "#ffb27a" : cloudShadow > 0.62 ? "#d4d8dc" : "#fff1d4";

  const fogNear = lerp(55, 13, fog);
  const fogFar = lerp(135, 42, fog);
  const cloudBase = new THREE.Color("#f2f0e9").lerp(new THREE.Color("#c8ced1"), cloudShadow * 0.62);
  const cloudShade = new THREE.Color("#8d969e").lerp(new THREE.Color("#46505a"), clamp(totalCloud * 0.7 + fog * 0.35, 0, 1));

  return {
    sunPos: pos,
    sunIntensity,
    sunColor,
    ambient: (lerp(0.25, 0.62, day) + totalCloud * 0.06) * lerp(1, 0.72, rainMood),
    skyColor: "#" + sky.getHexString(),
    fogColor: "#" + sky.clone().lerp(new THREE.Color(rainy ? "#31404a" : "#ffffff"), rainy ? 0.18 : 0.08).getHexString(),
    fogNear,
    fogFar,
    wind,
    gust,
    windKmh,
    gustKmh,
    windDeg,
    windVec,
    precip,
    precipIntensity,
    dayFactor: day,
    season,
    leafColor: LEAF_COLOR[season],
    snow,
    cloud: totalCloud,
    clouds: {
      low: cloudLayer(Math.max(lowCloud, fog * 0.35), 18, 10, 0.075, windKmh, 0.92),
      mid: cloudLayer(midCloud, 32, 16, 0.052, windKmh, 1.0),
      high: cloudLayer(highCloud, 52, 11, 0.032, windKmh * 1.25, 1.35),
      fog,
      visibilityM,
      baseColor: "#" + cloudBase.getHexString(),
      shadowColor: "#" + cloudShade.getHexString(),
    },
    storm: w.sky === "storm",
  };
}

// Manual presets for the settings menu. These are demo fixtures, but they keep
// realistic ranges and the same shape as live Open-Meteo readings.
export function manualWeather(hour: number, month: number, sky: Sky): Weather {
  const tempC = sky === "snow" ? -3 : sky === "clear" ? 22 : 12;
  const windKmh = sky === "storm" ? 38 : sky === "clouds" ? 16 : sky === "fog" ? 3 : 8;
  const gustKmh = sky === "storm" ? 58 : windKmh + 8;
  const windDeg =
    sky === "storm" ? 235 : sky === "rain" ? 210 : sky === "snow" ? 20 : sky === "fog" ? 120 : 255;
  const cloud =
    sky === "clear" ? 0.08 : sky === "clouds" ? 0.72 : sky === "fog" ? 0.92 : 1;
  const cloudLow = sky === "fog" ? 0.95 : sky === "rain" || sky === "snow" || sky === "storm" ? 0.8 : cloud * 0.28;
  const cloudMid = sky === "clear" ? 0.08 : sky === "clouds" ? 0.7 : 0.86;
  const cloudHigh = sky === "clear" ? 0.15 : sky === "storm" ? 0.7 : 0.55;
  return {
    place: GOSSENSASS.place,
    tempC,
    apparentTempC: tempC,
    humidity: sky === "fog" ? 97 : sky === "clear" ? 45 : 72,
    pressureHpa: sky === "storm" ? 1004 : 1018,
    surfacePressureHpa: sky === "storm" ? 895 : 905,
    precipMm: sky === "rain" || sky === "storm" ? 1.2 : 0,
    rainMm: sky === "rain" || sky === "storm" ? 1.2 : 0,
    snowfallCm: sky === "snow" ? 0.6 : 0,
    windKmh,
    gustKmh,
    windDeg,
    cloud,
    cloudLow,
    cloudMid,
    cloudHigh,
    visibilityM: sky === "fog" ? 2200 : sky === "snow" ? 9000 : 38000,
    hour,
    month,
    sky,
    live: false,
  };
}

export function weatherFromApiPayload(payload: Record<string, unknown>): Weather {
  return {
    place: typeof payload.place === "string" ? payload.place : GOSSENSASS.place,
    tempC: finite(payload.tempC as number | undefined, 12),
    apparentTempC: finite(payload.apparentTempC as number | undefined, 12),
    humidity: finite(payload.humidity as number | undefined, 55),
    pressureHpa: finite(payload.pressureHpa as number | undefined, 1016),
    surfacePressureHpa: finite(payload.surfacePressureHpa as number | undefined, 905),
    precipMm: finite(payload.precipMm as number | undefined, 0),
    rainMm: finite(payload.rainMm as number | undefined, 0),
    snowfallCm: finite(payload.snowfallCm as number | undefined, 0),
    windKmh: finite(payload.windKmh as number | undefined, 6),
    gustKmh: finite(payload.gustKmh as number | undefined, finite(payload.windKmh as number | undefined, 6)),
    windDeg: finite(payload.windDeg as number | undefined, 235),
    cloud: clamp(finite(payload.cloud as number | undefined, 0.3), 0, 1),
    cloudLow: clamp(finite(payload.cloudLow as number | undefined, 0.1), 0, 1),
    cloudMid: clamp(finite(payload.cloudMid as number | undefined, 0.3), 0, 1),
    cloudHigh: clamp(finite(payload.cloudHigh as number | undefined, 0.2), 0, 1),
    visibilityM: finite(payload.visibilityM as number | undefined, 40000),
    hour: finite(payload.hour as number | undefined, 12),
    sky: (typeof payload.sky === "string" ? payload.sky : "clear") as Sky,
    live: Boolean(payload.live),
  };
}

export { pct };
