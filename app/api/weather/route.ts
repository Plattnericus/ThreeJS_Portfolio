import { NextResponse } from "next/server";
import { STERZING, skyFromCode } from "@/lib/weather";

// Refresh the real Sterzing weather every 10 minutes.
export const revalidate = 600;

export async function GET() {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${STERZING.lat}` +
    `&longitude=${STERZING.lon}` +
    `&current=temperature_2m,weather_code,wind_speed_10m,cloud_cover,is_day` +
    `&timezone=${encodeURIComponent(STERZING.tz)}`;

  try {
    const res = await fetch(url, { next: { revalidate } });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const data = await res.json();
    const c = data.current ?? {};
    const hour = c.time ? new Date(c.time).getHours() : 12;

    return NextResponse.json({
      live: true,
      place: "Sterzing/Vipiteno, South Tyrol",
      tempC: c.temperature_2m ?? 12,
      windKmh: c.wind_speed_10m ?? 6,
      cloud: (c.cloud_cover ?? 30) / 100,
      hour,
      sky: skyFromCode(c.weather_code ?? 0),
    });
  } catch {
    // Fallback so the scene still has sensible conditions offline.
    return NextResponse.json({
      live: false,
      place: "Sterzing/Vipiteno, South Tyrol",
      tempC: 14,
      windKmh: 8,
      cloud: 0.35,
      hour: new Date().getHours(),
      sky: "clear",
    });
  }
}
