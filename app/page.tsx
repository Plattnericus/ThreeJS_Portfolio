"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import Hud from "@/components/Hud";
import SettingsMenu, {
  type GraphicsQuality,
  type ManualDate,
} from "@/components/SettingsMenu";
import type { ResolvedGraphicsQuality } from "@/components/Experience";
import SearchBar from "@/components/SearchBar";
import HouseInterior from "@/components/HouseInterior";
import MemorialSecret from "@/components/MemorialSecret";
import LoadingOverlay from "@/components/LoadingOverlay";
import { FlyIcon } from "@/components/Icons";
import { nameForHouse, type Stargazer } from "@/lib/stargazers";
import { resolveTier } from "@/lib/rarity";

// Toggle the in-scene star editor via env (NEXT_PUBLIC_DEV_CONTROLS=true).
const DEV_CONTROLS = process.env.NEXT_PUBLIC_DEV_CONTROLS === "true";
import {
  manualWeather,
  sceneFromWeather,
  weatherFromApiPayload,
  type Sky,
  type Weather,
} from "@/lib/weather";

const Experience = dynamic(() => import("@/components/Experience"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#0b1320]" />,
});

const STARGAZER_REFRESH_MS = 5 * 60 * 1000;
const LOADER_INTRO_MS = 900;
const GRAPHICS_STORAGE_KEY = "star-tree-graphics-quality";

function isGraphicsQuality(value: string | null): value is GraphicsQuality {
  return value === "auto" || value === "low" || value === "medium" || value === "high";
}

function detectGraphicsQuality(): ResolvedGraphicsQuality {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "medium";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const narrow = Math.min(window.innerWidth, window.innerHeight) < 820;
  const touchFirst = navigator.maxTouchPoints > 1 && narrow;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = nav.deviceMemory ?? (touchFirst ? 4 : 8);
  const dpr = window.devicePixelRatio || 1;

  if (touchFirst || cores <= 4 || memory <= 4) return "low";
  if (cores >= 8 && memory >= 8 && dpr >= 1.5) return "high";
  return "medium";
}

export default function Home() {
  const [stars, setStars] = useState(0);
  const [starsLive, setStarsLive] = useState(false);
  const [stargazers, setStargazers] = useState<Stargazer[] | null>(null);
  // When the stargazer feed was last successfully pulled — surfaced quietly in
  // the settings panel so you can tell how fresh the village is.
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [nextSync, setNextSync] = useState<number | null>(null);
  const [starsReady, setStarsReady] = useState(false);
  const [weatherReady, setWeatherReady] = useState(false);

  // Weather: live reading from Gossensass / Brenner, plus a manual override mode.
  const [liveWeather, setLiveWeather] = useState<Weather | null>(null);
  const [mode, setMode] = useState<"live" | "manual">("live");
  const [manualSky, setManualSky] = useState<Sky>("clear");
  const [search, setSearch] = useState("");
  const [searchActive, setSearchActive] = useState(-1);
  const [fly, setFly] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [secretOpen, setSecretOpen] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  // Let the loader draw first; mount WebGL only after live data is ready.
  const [loaderIntroDone, setLoaderIntroDone] = useState(false);
  const [mountScene, setMountScene] = useState(false);
  const [graphicsQuality, setGraphicsQuality] = useState<GraphicsQuality>("auto");
  const [resolvedGraphicsQuality, setResolvedGraphicsQuality] =
    useState<ResolvedGraphicsQuality>("medium");
  const now = new Date();
  const [date, setDate] = useState<ManualDate>({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: 13,
  });

  useEffect(() => {
    const id = window.setTimeout(() => setLoaderIntroDone(true), LOADER_INTRO_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(GRAPHICS_STORAGE_KEY);
    if (isGraphicsQuality(saved)) setGraphicsQuality(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(GRAPHICS_STORAGE_KEY, graphicsQuality);
    setResolvedGraphicsQuality(
      graphicsQuality === "auto" ? detectGraphicsQuality() : graphicsQuality,
    );
  }, [graphicsQuality]);

  const initialDataReady = starsReady && weatherReady;

  useEffect(() => {
    if (loaderIntroDone && initialDataReady) setMountScene(true);
  }, [initialDataReady, loaderIntroDone]);

  useEffect(() => {
    // Refresh stargazers every 5 minutes so new stars grow the tree live.
    // `no-store` so opening the page always re-checks live with the server
    // (which serves the cron-warmed cache instantly) instead of a stale browser
    // copy — the village is verified fresh right on the loading screen.
    const loadStars = () =>
      fetch("/api/stargazers", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (typeof d.stars === "number") setStars(d.stars);
          setStarsLive(Boolean(d.live));
          setStargazers(Array.isArray(d.stargazers) ? d.stargazers : null);
          const syncedAt = typeof d.fetchedAt === "number" ? d.fetchedAt : Date.now();
          setLastSync(syncedAt);
          setNextSync(Date.now() + STARGAZER_REFRESH_MS);
          setStarsReady(true);
        })
        .catch(() => {
          setStarsReady(true);
        });

    const loadWeather = () =>
      fetch("/api/weather")
        .then((r) => r.json())
        .then((d) => {
          setLiveWeather(weatherFromApiPayload(d));
          setWeatherReady(true);
        })
        .catch(() => {
          setLiveWeather(manualWeather(13, new Date().getMonth(), "clouds"));
          setWeatherReady(true);
        });

    loadStars();
    loadWeather();
    // Match the server cache window: refresh the live village every 5 minutes.
    const starId = DEV_CONTROLS ? null : setInterval(loadStars, STARGAZER_REFRESH_MS);
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
        weather ?? manualWeather(13, new Date().getMonth(), "clouds"),
      ),
    [weather],
  );

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    const count = Math.max(0, Math.floor(stars));
    const all = Array.from({ length: count }, (_, i) => {
      const gazer = stargazers?.[i] ?? null;
      return {
        index: i,
        name: nameForHouse(i, stargazers),
        tier: resolveTier(i, stargazers),
        contributor: Boolean(gazer?.contributor),
      };
    });
    if (!q) return all;
    return all.filter((result) => result.name.toLowerCase().includes(q));
  }, [search, stargazers, stars]);

  useEffect(() => {
    if (searchResults.length === 0) {
      setSearchActive(-1);
      return;
    }
    if (
      searchActive >= 0 &&
      !searchResults.some((result) => result.index === searchActive)
    ) {
      setSearchActive(searchResults[0].index);
    }
  }, [searchActive, searchResults]);

  const highlight = searchActive;

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
            graphicsQuality={resolvedGraphicsQuality}
            onSelectHouse={setSelected}
            onFindDove={() => setSecretOpen(true)}
            onReady={() => setSceneReady(true)}
          />
        )}
      </div>
      <LoadingOverlay
        sceneReady={sceneReady}
        dataReady={initialDataReady}
        starsReady={starsReady}
        weatherReady={weatherReady}
      />
      {secretOpen && <MemorialSecret onClose={() => setSecretOpen(false)} />}

      <div
        className={`transition duration-700 ease-out ${
          sceneReady ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <SearchBar
          query={search}
          onQuery={setSearch}
          results={searchResults}
          activeIndex={highlight}
          onActive={setSearchActive}
          onSelect={(result) => {
            setSearch(result.name);
            setSearchActive(result.index);
            setSelected(result.index);
          }}
        />

        <button
          onClick={() => setFly((f) => !f)}
          className={`anim-rise-x absolute bottom-20 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 text-xs backdrop-blur-xl transition active:scale-95 sm:bottom-6 ${
            fly
              ? "border-white/25 bg-white/15 text-white"
              : "border-white/10 bg-white/[0.06] text-white/70 hover:bg-white/10 hover:text-white"
          }`}
        >
          <FlyIcon className="h-3.5 w-3.5" />
          {fly ? "Exit fly mode" : "Fly around"}
        </button>
        {fly && (
          <div className="pointer-events-none absolute bottom-32 left-1/2 -translate-x-1/2 text-center text-[11px] text-white/45 sm:bottom-16">
            Click scene to lock look · WASD / arrows move · R / F up &amp; down · Esc releases
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
          devControls={DEV_CONTROLS}
          onChange={(n) => setStars(Math.max(0, n))}
        />
        <SettingsMenu
          weather={weather}
          mode={mode}
          date={date}
          manualSky={manualSky}
          starsLive={starsLive}
          lastSync={lastSync}
          nextSync={nextSync}
          graphicsQuality={graphicsQuality}
          resolvedGraphicsQuality={resolvedGraphicsQuality}
          onMode={setMode}
          onDate={setDate}
          onSky={setManualSky}
          onGraphicsQuality={setGraphicsQuality}
        />
      </div>
    </main>
  );
}
