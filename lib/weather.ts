// Weather model for the scene. We mirror real Sterzing/Vipiteno conditions and
// then EXAGGERATE them ("overstimulated") so they read clearly on screen.

import * as THREE from "three";

export const STERZING = { lat: 46.897, lon: 11.43, tz: "Europe/Rome" };

export type Precip = "none" | "rain" | "snow";
export type Sky = "clear" | "clouds" | "fog" | "rain" | "snow" | "storm";

export type Weather = {
  tempC: number;
  windKmh: number;
  cloud: number; // 0..1
  hour: number; // 0..24 local
  month?: number; // 0..11 (drives season); omitted = use today
  sky: Sky;
  live: boolean;
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
  precip: Precip;
  precipIntensity: number; // 0..1
  dayFactor: number; // 0 night .. 1 noon
  season: Season;
  leafColor: string; // seasonal foliage tint
  snow: number; // 0..1 accumulation on surfaces
  cloud: number; // 0..1 exaggerated cloud cover
};

// Northern-hemisphere season from month (0-11).
export function seasonFromMonth(month: number): Season {
  if (month <= 1 || month === 11) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "autumn";
}

const LEAF_COLOR: Record<Season, string> = {
  spring: "#86c34a",
  summer: "#5aa238",
  autumn: "#cc7a2b",
  winter: "#9fb0a6",
};

const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;

// Sun elevation from local hour (sunrise ~6, sunset ~20 in summer-ish curve).
function sunFromHour(hour: number): { pos: [number, number, number]; day: number } {
  const t = clamp((hour - 5.5) / 14, 0, 1); // 0 at ~5:30, 1 at ~19:30
  const elev = Math.sin(t * Math.PI); // 0..1..0
  const day = clamp(elev, 0, 1);
  const az = lerp(-1, 1, t);
  return { pos: [az * 30, 6 + elev * 28, 14], day };
}

/** Build exaggerated scene params from a weather reading. */
export function sceneFromWeather(w: Weather): SceneParams {
  const { pos, day } = sunFromHour(w.hour);

  // Exaggerate cloudiness and wind.
  const cloud = clamp(w.cloud * 1.25, 0, 1);
  const wind = clamp(0.4 + (w.windKmh / 30) * 1.6, 0.4, 3.2); // overstimulated

  // Day/night base colors.
  const nightSky = new THREE.Color("#1b2740");
  const daySky = new THREE.Color("#bcd9e8");
  const overcast = new THREE.Color("#9aa7ad");
  let sky = nightSky.clone().lerp(daySky, day);
  sky.lerp(overcast, cloud * 0.7); // clouds wash it grey

  let precip: Precip = "none";
  let precipIntensity = 0;
  if (w.sky === "rain" || w.sky === "storm") {
    precip = "rain";
    precipIntensity = w.sky === "storm" ? 1 : 0.7;
  } else if (w.sky === "snow") {
    precip = "snow";
    precipIntensity = 0.85;
  }

  // Storms/snow/fog darken & thicken fog.
  const fogThick = w.sky === "fog" || w.sky === "storm" || w.sky === "snow";

  // Season (real calendar, or the manually-set month) drives foliage tint; snow
  // settles in winter or when it's actively snowing.
  const season = seasonFromMonth(w.month ?? new Date().getMonth());
  const snow =
    precip === "snow" ? 0.9 : season === "winter" ? 0.45 : 0;

  const sunIntensity = lerp(0.15, 2.0, day) * lerp(1, 0.35, cloud);
  const sunColor =
    day < 0.25 ? "#ffb27a" : cloud > 0.6 ? "#cfd6da" : "#fff4e0";

  return {
    sunPos: pos,
    sunIntensity,
    sunColor,
    ambient: lerp(0.25, 0.6, day) + cloud * 0.1,
    skyColor: "#" + sky.getHexString(),
    fogColor: "#" + sky.clone().lerp(new THREE.Color("#ffffff"), 0.1).getHexString(),
    fogNear: fogThick ? 22 : 45,
    fogFar: fogThick ? 75 : 120,
    wind,
    precip,
    precipIntensity,
    dayFactor: day,
    season,
    leafColor: LEAF_COLOR[season],
    snow,
    cloud,
  };
}

// Manual presets for the settings menu (when not following live weather).
export function manualWeather(hour: number, month: number, sky: Sky): Weather {
  const tempC = sky === "snow" ? -3 : sky === "clear" ? 22 : 12;
  const windKmh = sky === "storm" ? 45 : sky === "clouds" ? 18 : 8;
  const cloud =
    sky === "clear" ? 0.05 : sky === "clouds" ? 0.7 : sky === "fog" ? 0.9 : 1;
  return { tempC, windKmh, cloud, hour, month, sky, live: false };
}
