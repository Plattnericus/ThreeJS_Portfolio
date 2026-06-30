"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import gsap from "gsap";
import { seasonFromMonth, type Sky, type Weather } from "@/lib/weather";
import {
  CalendarIcon,
  ClockIcon,
  CloseIcon,
  CloudIcon,
  FogIcon,
  RainIcon,
  SettingsIcon,
  SnowIcon,
  StormIcon,
  SunIcon,
  WindIcon,
} from "./Icons";

const SKIES: Sky[] = ["clear", "clouds", "fog", "rain", "snow", "storm"];
const GRAPHICS: GraphicsQuality[] = ["auto", "low", "medium", "high"];

// Condition accents reuse the scene palette so the panel stays visually connected.
const SKY_ACCENT: Record<Sky, string> = {
  clear: "#e6b25a",
  clouds: "#9fb2bd",
  fog: "#aeb7b5",
  rain: "#6aa6e0",
  snow: "#dfeaf2",
  storm: "#9b8cf0",
};

const SEASON_ACCENT: Record<string, string> = {
  spring: "#8fce5a",
  summer: "#5aa238",
  autumn: "#d98a3a",
  winter: "#8fc6e6",
};

const SKY_ICON: Record<Sky, ComponentType<{ className?: string }>> = {
  clear: SunIcon,
  clouds: CloudIcon,
  fog: FogIcon,
  rain: RainIcon,
  snow: SnowIcon,
  storm: StormIcon,
};

export type ManualDate = {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  hour: number; // 0..23
};

export type GraphicsQuality = "auto" | "low" | "medium" | "high";
type ResolvedGraphicsQuality = Exclude<GraphicsQuality, "auto">;

// Compact relative phrasing for the refresh status.
function relTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function countdown(ms: number | null): string {
  if (ms === null) return "--:--";
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function cardinal(deg: number | undefined): string {
  if (typeof deg !== "number" || !Number.isFinite(deg)) return "--";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % dirs.length];
}

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

export default function SettingsMenu({
  weather,
  mode,
  date,
  manualSky,
  starsLive,
  lastSync,
  nextSync,
  graphicsQuality,
  resolvedGraphicsQuality,
  onMode,
  onDate,
  onSky,
  onGraphicsQuality,
}: {
  weather: Weather | null;
  mode: "live" | "manual";
  date: ManualDate;
  manualSky: Sky;
  starsLive: boolean;
  lastSync: number | null;
  nextSync: number | null;
  graphicsQuality: GraphicsQuality;
  resolvedGraphicsQuality: ResolvedGraphicsQuality;
  onMode: (m: "live" | "manual") => void;
  onDate: (d: ManualDate) => void;
  onSky: (s: Sky) => void;
  onGraphicsQuality: (q: GraphicsQuality) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [, setTick] = useState(0); // drives the live "synced … ago" readout
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const gearIconRef = useRef<HTMLSpanElement>(null);
  const closeIconRef = useRef<HTMLSpanElement>(null);
  const rippleRef = useRef<HTMLSpanElement>(null);
  const sweepRef = useRef<HTMLDivElement>(null);
  const season = seasonFromMonth(Math.min(11, Math.max(0, date.month - 1)));
  const seasonColor = SEASON_ACCENT[season];
  const nextMs = nextSync ? Math.max(0, nextSync - Date.now()) : null;
  const syncWindow = lastSync && nextSync ? Math.max(1, nextSync - lastSync) : 1;
  const syncProgress =
    lastSync && nextSync
      ? Math.min(100, Math.max(0, ((Date.now() - lastSync) / syncWindow) * 100))
      : 0;

  // Keep the sync timer fresh only while the panel is mounted.
  useEffect(() => {
    if (!mounted) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [mounted]);

  // Morph the gear into a close icon with a short tactile ripple.
  useEffect(() => {
    const gear = gearIconRef.current;
    const close = closeIconRef.current;
    if (!gear || !close) return;
    gsap.killTweensOf([gear, close, rippleRef.current]);

    if (open) {
      gsap
        .timeline()
        .to(gear, { x: -20, autoAlpha: 0, duration: 0.26, ease: "power2.in" })
        .fromTo(
          close,
          { x: 20, autoAlpha: 0 },
          { x: 0, autoAlpha: 1, duration: 0.4, ease: "back.out(1.8)" },
          "-=0.15",
        );
    } else {
      gsap
        .timeline()
        .to(close, { x: 20, autoAlpha: 0, duration: 0.24, ease: "power2.in" })
        .fromTo(
          gear,
          { x: -20, autoAlpha: 0 },
          { x: 0, autoAlpha: 1, duration: 0.42, ease: "back.out(1.7)" },
          "-=0.13",
        );
    }

    if (rippleRef.current) {
      gsap.fromTo(
        rippleRef.current,
        { scale: 0.55, opacity: 0.5 },
        { scale: 2.1, opacity: 0, duration: 0.6, ease: "power2.out" },
      );
    }
  }, [open]);

  // Open the panel with a compact spring and row stagger.
  useEffect(() => {
    if (!mounted || !panelRef.current) return;
    const panel = panelRef.current;
    const items = panel.querySelectorAll<HTMLElement>("[data-settings-item]");
    gsap.killTweensOf([panel, sweepRef.current, ...Array.from(items)]);

    if (open) {
      const tl = gsap.timeline();
      tl.fromTo(
        panel,
        { autoAlpha: 0, y: -12, scale: 0.96, filter: "blur(12px)", transformOrigin: "top right" },
        { autoAlpha: 1, y: 0, scale: 1, filter: "blur(0px)", duration: 0.4, ease: "power3.out" },
      ).fromTo(
        items,
        { autoAlpha: 0, y: 9 },
        { autoAlpha: 1, y: 0, duration: 0.3, stagger: 0.04, ease: "power2.out" },
        "-=0.22",
      );
      if (sweepRef.current) {
        tl.fromTo(
          sweepRef.current,
          { xPercent: -140, opacity: 0 },
          { xPercent: 145, opacity: 0.5, duration: 0.85, ease: "power2.out" },
          0.06,
        );
      }
      return;
    }

    gsap
      .timeline({ onComplete: () => setMounted(false) })
      .to(items, {
        autoAlpha: 0,
        y: 5,
        duration: 0.15,
        stagger: { each: 0.02, from: "end" },
        ease: "power2.in",
      })
      .to(
        panel,
        {
          autoAlpha: 0,
          y: -10,
          scale: 0.965,
          filter: "blur(10px)",
          duration: 0.24,
          ease: "power2.inOut",
        },
        "-=0.1",
      );
  }, [mounted, open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isTextInputTarget(event.target)) return;
      event.preventDefault();
      setMounted(true);
      setOpen((value) => !value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
    };
  }, [mounted]);

  const num = (
    label: string,
    key: keyof ManualDate,
    min: number,
    max: number,
    icon?: ComponentType<{ className?: string }>,
  ) => (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-white/42">
        {icon &&
          (() => {
            const Icon = icon;
            return <Icon className="h-3 w-3" />;
          })()}
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={date[key]}
        onChange={(e) => onDate({ ...date, [key]: Number(e.target.value) || 0 })}
        className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.045] px-2.5 text-sm font-semibold tabular-nums text-white outline-none transition focus:border-[#9fd272]/70 focus:bg-white/[0.075] focus:ring-2 focus:ring-[#9fd272]/18"
      />
    </label>
  );

  return (
    <div ref={rootRef} className="anim-slide-right absolute right-5 top-5 text-right">
      {/* Transform-only idle motion for the settings trigger. */}
      <span className={`gear-float inline-block ${open ? "gear-float--rest" : ""}`}>
        <button
          onClick={() => {
            if (open) {
              setOpen(false);
              return;
            }
            setMounted(true);
            setOpen(true);
          }}
          aria-label={open ? "Close" : "Settings"}
          aria-expanded={open}
          className="settings-gear-btn relative grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-white/10 bg-white/[0.06] text-white/70 shadow-lg shadow-black/25 backdrop-blur-xl transition hover:border-[#9fd272]/40 hover:bg-white/10 hover:text-white active:scale-90"
        >
          {/* toggle ripple */}
          <span
            ref={rippleRef}
            className="pointer-events-none absolute inset-0 rounded-full opacity-0 ring-2 ring-[#9fd272]/55"
          />
          <span className="relative grid h-4 w-4 place-items-center">
            <span ref={gearIconRef} className="absolute inset-0 grid place-items-center">
              <span className="settings-gear-idle grid place-items-center">
                <SettingsIcon className="h-4 w-4" />
              </span>
            </span>
            <span ref={closeIconRef} className="absolute inset-0 grid place-items-center opacity-0">
              <CloseIcon className="h-4 w-4" />
            </span>
          </span>
        </button>
      </span>

      {mounted && (
        <div
          ref={panelRef}
          className="relative mt-2 w-[340px] overflow-hidden rounded-2xl border border-white/10 text-left opacity-0 shadow-2xl shadow-black/55 backdrop-blur-2xl ring-1 ring-[#9fd272]/10"
        >
          <div
            ref={sweepRef}
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/12 to-transparent opacity-0"
          />
          <div className="relative bg-gradient-to-br from-[#1a2a21]/92 via-[#101a16]/91 to-[#08100d]/95 px-4 pb-3.5 pt-4">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(159,210,114,0.17),transparent_34%),radial-gradient(circle_at_92%_22%,rgba(230,178,90,0.11),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.05),transparent_42%)]" />
            <div data-settings-item className="relative flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${mode === "live" ? "settings-pulse" : ""}`}
                    style={{ background: mode === "live" ? "#7ec85a" : "#6b7280" }}
                  />
                  <span className="text-[13px] font-semibold tracking-tight text-white/95">
                    Gossensass, Brenner
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-white/48">
                  {weather
                    ? `${Math.round(weather.tempC)}°C · ${weather.sky} · ${Math.round(weather.humidity)}% RH`
                    : "loading"}
                </div>
              </div>
              <div className="flex max-w-[142px] items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.065] px-2 py-1 text-[11px] font-semibold leading-tight text-white/66">
                <WindIcon className="h-3.5 w-3.5 text-[#9fd272]" />
                {weather
                  ? `${Math.round(weather.windKmh)} km/h ${cardinal(weather.windDeg)} · ${Math.round(weather.gustKmh)} gust`
                  : "--"}
              </div>
            </div>
          </div>

          <div className="space-y-4 bg-[#0a100d]/78 px-4 pb-3 pt-3.5">
            <div data-settings-item className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/28 p-1">
              {(["live", "manual"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => onMode(m)}
                  className={`rounded-lg py-2 text-xs font-semibold capitalize transition ${
                    mode === m
                      ? "bg-[#9fd272] text-[#0a100d] shadow-sm shadow-[#9fd272]/30"
                      : "text-white/55 hover:text-white"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            <div data-settings-item>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/42">
                  Graphics
                </span>
                <span className="text-[11px] font-semibold capitalize text-white/55">
                  {graphicsQuality === "auto"
                    ? `Auto · ${resolvedGraphicsQuality}`
                    : graphicsQuality}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1 rounded-xl border border-white/10 bg-black/28 p-1">
                {GRAPHICS.map((q) => {
                  const active = graphicsQuality === q;
                  return (
                    <button
                      key={q}
                      onClick={() => onGraphicsQuality(q)}
                      className={`rounded-lg py-2 text-[11px] font-semibold capitalize transition ${
                        active
                          ? "bg-white/88 text-[#0a100d] shadow-sm shadow-white/18"
                          : "text-white/52 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      {q}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              className={
                mode === "manual"
                  ? "space-y-3.5"
                  : "pointer-events-none space-y-3.5 opacity-40"
              }
            >
              <div data-settings-item className="grid grid-cols-[0.75fr_0.75fr_1fr] gap-2">
                {num("Day", "day", 1, 31, CalendarIcon)}
                {num("Month", "month", 1, 12, CalendarIcon)}
                {num("Year", "year", 1900, 2200, CalendarIcon)}
              </div>
              <div data-settings-item className="grid grid-cols-[0.82fr_1.18fr] items-end gap-2">
                {num("Hour", "hour", 0, 23, ClockIcon)}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/42">
                    Season
                  </span>
                  <span
                    className="flex h-9 items-center gap-2 rounded-lg border px-2.5 text-sm font-semibold capitalize"
                    style={{
                      color: seasonColor,
                      borderColor: seasonColor + "33",
                      background: seasonColor + "14",
                    }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: seasonColor }} />
                    {season}
                  </span>
                </div>
              </div>

              <div data-settings-item>
                <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/42">
                  Conditions
                </span>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  {SKIES.map((s) => {
                    const active = manualSky === s;
                    const c = SKY_ACCENT[s];
                    const Icon = SKY_ICON[s];
                    return (
                      <button
                        key={s}
                        onClick={() => onSky(s)}
                        className="flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-[11px] font-semibold capitalize transition"
                        style={
                          active
                            ? { color: c, borderColor: c + "66", background: c + "1f" }
                            : { color: "rgba(255,255,255,0.6)", borderColor: "rgba(255,255,255,0.1)", background: "transparent" }
                          }
                      >
                        <Icon className="h-4 w-4" />
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Stargazer refresh status. */}
          <div
            data-settings-item
            className="border-t border-white/[0.07] bg-black/32 px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-white/38">
                <span className="relative grid h-2 w-2 place-items-center">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${starsLive ? "settings-pulse" : ""}`}
                    style={{ background: starsLive ? "#7ec85a" : "#6b7280" }}
                  />
                </span>
                Stargazers
              </span>
              <span className="text-[11px] font-semibold tabular-nums text-white/58">
                {lastSync ? `synced ${relTime(Date.now() - lastSync)}` : "syncing..."}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#7ec85a] via-[#9fd272] to-[#e6b25a] transition-[width] duration-500 ease-linear"
                  style={{ width: `${syncProgress}%` }}
                />
              </div>
              <span className="min-w-[72px] text-right text-[11px] font-semibold tabular-nums text-[#9fd272]/82">
                {nextMs === 0 ? "refreshing" : `next ${countdown(nextMs)}`}
              </span>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .settings-pulse {
          animation: settings-pulse 2s ease-in-out infinite;
        }
        @keyframes settings-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(126, 200, 90, 0.5); }
          50% { box-shadow: 0 0 0 4px rgba(126, 200, 90, 0); }
        }
        /* GPU-friendly idle motion for the settings trigger. */
        .gear-float {
          animation: gear-float 4.2s ease-in-out infinite;
          will-change: transform;
          transform: translateX(0);
        }
        @keyframes gear-float {
          0% { transform: translateX(7px); }
          50% { transform: translateX(-7px); }
          100% { transform: translateX(7px); }
        }
        /* Keep the panel anchored while it is open. */
        .gear-float--rest {
          animation: none;
          transform: translateX(0);
          transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
        }
        /* Slow idle rotation for a subtle active state. */
        .settings-gear-idle {
          animation: settings-gear-idle 14s linear infinite;
        }
        .settings-gear-btn:hover .settings-gear-idle {
          animation-duration: 3.2s;
        }
        @keyframes settings-gear-idle {
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .settings-pulse,
          .settings-gear-idle,
          .gear-float { animation: none; transform: none; }
        }
      `}</style>
    </div>
  );
}
