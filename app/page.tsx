"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import Hud from "@/components/Hud";
import SettingsMenu, { type ManualDate } from "@/components/SettingsMenu";
import SearchBar from "@/components/SearchBar";
import { nameForIndex } from "@/lib/names";
import {
  manualWeather,
  sceneFromWeather,
  type Sky,
  type Weather,
} from "@/lib/weather";

const Experience = dynamic(() => import("@/components/Experience"), {
  ssr: false,
  loading: () => <LoadingScreen />,
});

function LoadingScreen() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#0b1320]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-canopy" />
        <p className="text-sm text-white/50">Growing the tree…</p>
      </div>
    </div>
  );
}

export default function Home() {
  const [stars, setStars] = useState(0);
  const [starsLive, setStarsLive] = useState(false);

  // Weather: live reading from Sterzing, plus a manual override mode.
  const [liveWeather, setLiveWeather] = useState<Weather | null>(null);
  const [mode, setMode] = useState<"live" | "manual">("live");
  const [manualSky, setManualSky] = useState<Sky>("clear");
  const [search, setSearch] = useState("");
  const [fly, setFly] = useState(false);
  const now = new Date();
  const [date, setDate] = useState<ManualDate>({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: 13,
  });

  useEffect(() => {
    fetch("/api/stargazers")
      .then((r) => r.json())
      .then((d) => {
        setStars(typeof d.stars === "number" ? d.stars : 0);
        setStarsLive(Boolean(d.live));
      })
      .catch(() => {});

    const loadWeather = () =>
      fetch("/api/weather")
        .then((r) => r.json())
        .then((d) =>
          setLiveWeather({
            tempC: d.tempC,
            windKmh: d.windKmh,
            cloud: d.cloud,
            hour: d.hour,
            sky: d.sky,
            live: d.live,
          }),
        )
        .catch(() => {});
    loadWeather();
    const id = setInterval(loadWeather, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const weather: Weather | null =
    mode === "manual"
      ? manualWeather(date.hour, Math.min(11, Math.max(0, date.month - 1)), manualSky)
      : liveWeather;

  const params = useMemo(
    () =>
      sceneFromWeather(
        weather ?? {
          tempC: 14,
          windKmh: 8,
          cloud: 0.3,
          hour: 13,
          sky: "clear",
          live: false,
        },
      ),
    [weather],
  );

  // Match search against the (placeholder) house names, within current stars.
  const q = search.trim().toLowerCase();
  let highlight = -1;
  let matchName: string | null = null;
  if (q) {
    for (let i = 0; i < stars; i++) {
      if (nameForIndex(i).toLowerCase().includes(q)) {
        highlight = i;
        matchName = nameForIndex(i);
        break;
      }
    }
  }

  return (
    <main className="relative h-full w-full overflow-hidden">
      <Experience
        stars={stars}
        params={params}
        highlight={highlight}
        fly={fly}
      />
      <SearchBar query={search} onQuery={setSearch} match={matchName} />

      <button
        onClick={() => setFly((f) => !f)}
        className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-md border border-white/10 bg-black/30 px-4 py-1.5 text-xs text-white/80 backdrop-blur-sm hover:bg-white/10"
      >
        {fly ? "Exit fly mode" : "🕊 Fly around"}
      </button>
      {fly && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 text-center text-[11px] text-white/50">
          WASD / arrows to move · drag to look · R/F up &amp; down
        </div>
      )}
      <Hud
        stars={stars}
        live={starsLive}
        onChange={(n) => setStars(Math.max(0, n))}
      />
      <SettingsMenu
        weather={weather}
        mode={mode}
        date={date}
        manualSky={manualSky}
        onMode={setMode}
        onDate={setDate}
        onSky={setManualSky}
      />
    </main>
  );
}
