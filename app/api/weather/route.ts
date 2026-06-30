import { NextResponse } from "next/server";
import { GOSSENSASS, skyFromCode } from "@/lib/weather";

// Refresh the real Gossensass / Brenner weather every 10 minutes.
export const revalidate = 600;

const CURRENT_FIELDS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "precipitation",
  "rain",
  "snowfall",
  "weather_code",
  "cloud_cover",
  "pressure_msl",
  "surface_pressure",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "is_day",
].join(",");

const HOURLY_FIELDS = [
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "visibility",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
].join(",");

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function pct(value: unknown, fallback: number): number {
  return Math.max(0, Math.min(1, num(value, fallback * 100) / 100));
}

function currentHourIndex(times: unknown, currentTime: unknown): number {
  if (!Array.isArray(times) || typeof currentTime !== "string") return -1;
  const exact = times.findIndex((t) => t === currentTime.slice(0, 13) + ":00");
  if (exact >= 0) return exact;
  const currentMs = Date.parse(currentTime);
  if (!Number.isFinite(currentMs)) return -1;
  let best = -1;
  let bestDelta = Infinity;
  times.forEach((t, i) => {
    if (typeof t !== "string") return;
    const ms = Date.parse(t);
    const delta = Math.abs(ms - currentMs);
    if (Number.isFinite(delta) && delta < bestDelta) {
      best = i;
      bestDelta = delta;
    }
  });
  return best;
}

function hourlyNum(hourly: Record<string, unknown>, key: string, index: number, fallback: number): number {
  const arr = hourly[key];
  if (!Array.isArray(arr) || index < 0) return fallback;
  return num(arr[index], fallback);
}

export async function GET() {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${GOSSENSASS.lat}` +
    `&longitude=${GOSSENSASS.lon}` +
    `&current=${CURRENT_FIELDS}` +
    `&hourly=${HOURLY_FIELDS}` +
    `&forecast_days=1` +
    `&timezone=${encodeURIComponent(GOSSENSASS.tz)}`;

  try {
    const res = await fetch(url, { next: { revalidate } });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const data = await res.json();
    const c = data.current ?? {};
    const hourly = data.hourly ?? {};
    const hourIndex = currentHourIndex(hourly.time, c.time);
    const hour = c.time ? new Date(c.time).getHours() : 12;

    return NextResponse.json({
      live: true,
      place: GOSSENSASS.place,
      tempC: num(c.temperature_2m, 12),
      apparentTempC: num(c.apparent_temperature, num(c.temperature_2m, 12)),
      humidity: num(c.relative_humidity_2m, 55),
      pressureHpa: num(c.pressure_msl, 1016),
      surfacePressureHpa: num(c.surface_pressure, 905),
      precipMm: num(c.precipitation, 0),
      rainMm: num(c.rain, 0),
      snowfallCm: num(c.snowfall, 0),
      windKmh: num(c.wind_speed_10m, hourlyNum(hourly, "wind_speed_10m", hourIndex, 6)),
      gustKmh: num(c.wind_gusts_10m, hourlyNum(hourly, "wind_gusts_10m", hourIndex, 8)),
      windDeg: num(c.wind_direction_10m, hourlyNum(hourly, "wind_direction_10m", hourIndex, 235)),
      cloud: pct(c.cloud_cover, 0.3),
      cloudLow: pct(hourlyNum(hourly, "cloud_cover_low", hourIndex, 0), 0),
      cloudMid: pct(hourlyNum(hourly, "cloud_cover_mid", hourIndex, 30), 0.3),
      cloudHigh: pct(hourlyNum(hourly, "cloud_cover_high", hourIndex, 20), 0.2),
      visibilityM: hourlyNum(hourly, "visibility", hourIndex, 40000),
      hour,
      sky: skyFromCode(num(c.weather_code, 0)),
    });
  } catch {
    // Fallback so the scene still has sensible mountain weather offline.
    return NextResponse.json({
      live: false,
      place: GOSSENSASS.place,
      tempC: 14,
      apparentTempC: 14,
      humidity: 62,
      pressureHpa: 1017,
      surfacePressureHpa: 905,
      precipMm: 0,
      rainMm: 0,
      snowfallCm: 0,
      windKmh: 8,
      gustKmh: 14,
      windDeg: 235,
      cloud: 0.35,
      cloudLow: 0.05,
      cloudMid: 0.35,
      cloudHigh: 0.25,
      visibilityM: 40000,
      hour: new Date().getHours(),
      sky: "clouds",
    });
  }
}
