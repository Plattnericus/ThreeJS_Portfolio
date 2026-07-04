"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import SettingsMenu, { type ManualDate } from "@/components/SettingsMenu";
import Clock from "@/components/Clock";
import RotateControls from "@/components/RotateControls";
import {
  isGraphicsQuality,
  type GraphicsQuality,
  type ResolvedGraphicsQuality,
} from "@/lib/quality";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { useCoarsePointer } from "@/lib/useCoarsePointer";
import SearchBar from "@/components/SearchBar";
import HouseInterior from "@/components/HouseInterior";
import MemorialSecret from "@/components/MemorialSecret";
import LoadingOverlay from "@/components/LoadingOverlay";
import { FlyIcon } from "@/components/Icons";
import { nameForHouse, type Stargazer } from "@/lib/stargazers";
import { resolveTier } from "@/lib/rarity";
import { nowInZone } from "@/lib/astro";
import { GOSSENSASS } from "@/lib/location";

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

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

// Auto-detect stays conservative: it never resolves to "extreme" — that tier is
// opt-in only, so auto users always land on a 60fps-safe profile.
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

export default function Page() {
  return (
    <I18nProvider>
      <Home />
    </I18nProvider>
  );
}

function Home() {
  const { t } = useI18n();
  const coarse = useCoarsePointer();
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
  const [menuOpen, setMenuOpen] = useState(false);
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

  // ONE Escape hierarchy for the whole HUD: memorial → house panel → menu.
  // Fly mode is excluded — there Esc releases the pointer lock.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isTextInputTarget(event.target) || fly) return;
      event.preventDefault();
      if (secretOpen) {
        setSecretOpen(false);
        return;
      }
      if (selected !== null) {
        setSelected(null);
        return;
      }
      setMenuOpen((open) => !open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fly, secretOpen, selected]);

  useEffect(() => {
    const saved = window.localStorage.getItem(GRAPHICS_STORAGE_KEY);
    if (isGraphicsQuality(saved)) setGraphicsQuality(saved);
  }, []);

  // QA override: ?hour=21&sky=storm&day=3&month=7 forces manual weather so any
  // time/condition can be checked from the URL (used by visual tests too).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const hour = q.get("hour");
    const sky = q.get("sky");
    const day = q.get("day");
    const month = q.get("month");
    if (hour === null && sky === null) return;
    setMode("manual");
    setDate((d) => ({
      ...d,
      hour: hour !== null ? Math.min(23, Math.max(0, Number(hour) || 0)) : d.hour,
      day: day !== null ? Math.min(31, Math.max(1, Number(day) || d.day)) : d.day,
      month: month !== null ? Math.min(12, Math.max(1, Number(month) || d.month)) : d.month,
    }));
    if (sky && ["clear", "clouds", "fog", "rain", "snow", "storm"].includes(sky)) {
      setManualSky(sky as Sky);
    }
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
    // `no-store` keeps the browser from reusing an old response on startup.
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
    // Refresh the live village every 5 minutes while the site is open.
    const starId = setInterval(loadStars, STARGAZER_REFRESH_MS);
    const weatherId = setInterval(loadWeather, 10 * 60 * 1000);
    return () => {
      clearInterval(starId);
      clearInterval(weatherId);
    };
  }, []);

  // The sun/moon follow the real clock: bump once a minute so live mode keeps
  // moving between the 10-minute weather refreshes.
  const [timeTick, setTimeTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTimeTick((t) => t + 1), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const weather: Weather | null = useMemo(() => {
    if (mode === "manual") {
      return manualWeather(
        date.hour,
        Math.min(11, Math.max(0, date.month - 1)),
        manualSky,
        date.year,
        date.day,
      );
    }
    if (!liveWeather) return null;
    const local = nowInZone(GOSSENSASS.tz);
    return {
      ...liveWeather,
      year: local.year,
      month: local.month,
      day: local.day,
      hour: local.hour,
      minute: local.minute,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- timeTick re-reads the wall clock
  }, [mode, date, manualSky, liveWeather, timeTick]);

  const params = useMemo(
    () =>
      sceneFromWeather(
        weather ?? manualWeather(13, new Date().getMonth(), "clouds"),
      ),
    [weather],
  );

  // Dev-only introspection for the headless visual tests.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __sceneParams?: unknown }).__sceneParams = params;
    }
  }, [params]);

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

        {/* Fly mode is pointer-lock + WASD — unusable on touch, so it is
            desktop-only. */}
        {!coarse && (
          <button
            onClick={() => setFly((f) => !f)}
            className={`anim-rise-x absolute bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 text-xs backdrop-blur-xl transition active:scale-95 sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] ${
              fly
                ? "border-white/25 bg-white/15 text-white"
                : "border-white/10 bg-white/[0.06] text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            <FlyIcon className="h-3.5 w-3.5" />
            {fly ? t("fly.exit") : t("fly.enter")}
          </button>
        )}
        {fly && !coarse && (
          <div className="pointer-events-none absolute bottom-32 left-1/2 -translate-x-1/2 text-center text-[11px] text-white/45 sm:bottom-16">
            {t("fly.hint")}
          </div>
        )}

        {selected !== null && (
          <HouseInterior
            index={selected}
            stargazer={stargazers?.[selected] ?? null}
            onClose={() => setSelected(null)}
          />
        )}
        <Clock
          mode={mode}
          manualHour={date.hour}
          sunrise={liveWeather?.sunrise}
          sunset={liveWeather?.sunset}
          onOpenMenu={() => setMenuOpen(true)}
        />
        <RotateControls fly={fly} />
        <SettingsMenu
          weather={weather}
          mode={mode}
          date={date}
          manualSky={manualSky}
          stars={stars}
          devControls={DEV_CONTROLS}
          onChangeStars={(n) => setStars(Math.max(0, n))}
          starsLive={starsLive}
          lastSync={lastSync}
          nextSync={nextSync}
          graphicsQuality={graphicsQuality}
          resolvedGraphicsQuality={resolvedGraphicsQuality}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          onMode={setMode}
          onDate={setDate}
          onSky={setManualSky}
          onGraphicsQuality={setGraphicsQuality}
          onReset={() => {
            const fresh = new Date();
            setGraphicsQuality("auto");
            setMode("live");
            setManualSky("clear");
            setDate({
              year: fresh.getFullYear(),
              month: fresh.getMonth() + 1,
              day: fresh.getDate(),
              hour: 13,
            });
            setMenuOpen(false);
          }}
        />
      </div>

      {/* Filmic finish: soft anamorphic-style vignette + a whisper of film
          grain. Pure DOM overlays — zero GPU pipeline cost. */}
      <div
        className="pointer-events-none absolute inset-0 z-[8]"
        style={{
          background: `radial-gradient(ellipse at center, transparent ${
            resolvedGraphicsQuality === "extreme" ? "56%" : "62%"
          }, rgba(4,2,0,${resolvedGraphicsQuality === "extreme" ? 0.3 : 0.2}) 100%)`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-[8] mix-blend-overlay"
        style={{
          opacity: 0.05,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23g)'/%3E%3C/svg%3E\")",
        }}
      />
    </main>
  );
}
