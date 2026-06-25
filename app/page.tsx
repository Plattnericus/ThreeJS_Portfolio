"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import Hud from "@/components/Hud";
import SettingsMenu, { type ManualDate } from "@/components/SettingsMenu";
import SearchBar from "@/components/SearchBar";
import HouseInterior from "@/components/HouseInterior";
import MemorialSecret from "@/components/MemorialSecret";
import LoadingOverlay from "@/components/LoadingOverlay";
import { FlyIcon } from "@/components/Icons";
import { nameForHouse, type Stargazer } from "@/lib/stargazers";

// Toggle the in-scene star editor via env (NEXT_PUBLIC_DEV_CONTROLS=true).
const DEV_CONTROLS = process.env.NEXT_PUBLIC_DEV_CONTROLS === "true";
import {
  manualWeather,
  sceneFromWeather,
  type Sky,
  type Weather,
} from "@/lib/weather";

const Experience = dynamic(() => import("@/components/Experience"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#0b1320]" />,
});

export default function Home() {
  const [stars, setStars] = useState(0);
  const [starsLive, setStarsLive] = useState(false);
  const [stargazers, setStargazers] = useState<Stargazer[] | null>(null);

  // Weather: live reading from Sterzing, plus a manual override mode.
  const [liveWeather, setLiveWeather] = useState<Weather | null>(null);
  const [mode, setMode] = useState<"live" | "manual">("live");
  const [manualSky, setManualSky] = useState<Sky>("clear");
  const [search, setSearch] = useState("");
  const [fly, setFly] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [secretOpen, setSecretOpen] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  // Delay the heavy 3D mount briefly so the loader's draw animation plays on a
  // free main thread first (GLTF parsing otherwise stutters it).
  const [mountScene, setMountScene] = useState(false);
  const now = new Date();
  const [date, setDate] = useState<ManualDate>({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: 13,
  });

  useEffect(() => {
    const id = window.setTimeout(() => setMountScene(true), 1300);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    // Poll the repo's star count every minute so new stars grow the tree live.
    const loadStars = () =>
      fetch("/api/stargazers")
        .then((r) => r.json())
        .then((d) => {
          if (typeof d.stars === "number") setStars(d.stars);
          setStarsLive(Boolean(d.live));
          setStargazers(Array.isArray(d.stargazers) ? d.stargazers : null);
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

    loadStars();
    loadWeather();
    // Poll every minute in production; skip in dev so the +/- editor isn't reset.
    const starId = DEV_CONTROLS ? null : setInterval(loadStars, 60 * 1000);
    const weatherId = setInterval(loadWeather, 10 * 60 * 1000);
    return () => {
      if (starId) clearInterval(starId);
      clearInterval(weatherId);
    };
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
      const nm = nameForHouse(i, stargazers);
      if (nm.toLowerCase().includes(q)) {
        highlight = i;
        matchName = nm;
        break;
      }
    }
  }

  return (
    <main className="relative h-full w-full overflow-hidden">
      <div
        className={`absolute inset-0 transition duration-1000 ease-out ${
          sceneReady ? "scale-100 opacity-100 blur-0" : "scale-[1.015] opacity-0 blur-[2px]"
        }`}
      >
        {mountScene && (
          <Experience
            stars={stars}
            params={params}
            highlight={highlight}
            fly={fly}
            stargazers={stargazers}
            onSelectHouse={setSelected}
            onFindDove={() => setSecretOpen(true)}
            onReady={() => setSceneReady(true)}
          />
        )}
      </div>
      <LoadingOverlay sceneReady={sceneReady} />
      {secretOpen && <MemorialSecret onClose={() => setSecretOpen(false)} />}

      <div
        className={`transition duration-700 ease-out ${
          sceneReady ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <SearchBar query={search} onQuery={setSearch} match={matchName} />

        <button
          onClick={() => setFly((f) => !f)}
          className={`anim-rise-x absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 text-xs backdrop-blur-xl transition active:scale-95 ${
            fly
              ? "border-white/25 bg-white/15 text-white"
              : "border-white/10 bg-white/[0.06] text-white/70 hover:bg-white/10 hover:text-white"
          }`}
        >
          <FlyIcon className="h-3.5 w-3.5" />
          {fly ? "Exit fly mode" : "Fly around"}
        </button>
        {fly && (
          <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 text-center text-[11px] text-white/45">
            WASD / arrows to move · drag to look · R / F up &amp; down
          </div>
        )}

        {selected !== null && (
          <HouseInterior
            index={selected}
            stargazer={stargazers?.[selected] ?? null}
            onClose={() => setSelected(null)}
          />
        )}
        <Hud
          stars={stars}
          live={starsLive}
          devControls={DEV_CONTROLS}
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
      </div>
    </main>
  );
}
