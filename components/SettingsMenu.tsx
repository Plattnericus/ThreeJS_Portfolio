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

// One deliberate accent per condition — pulled from the scene's own palette so
// the panel reads as part of the world, just a touch heightened.
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

export default function SettingsMenu({
  weather,
  mode,
  date,
  manualSky,
  onMode,
  onDate,
  onSky,
}: {
  weather: Weather | null;
  mode: "live" | "manual";
  date: ManualDate;
  manualSky: Sky;
  onMode: (m: "live" | "manual") => void;
  onDate: (d: ManualDate) => void;
  onSky: (s: Sky) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const sweepRef = useRef<HTMLDivElement>(null);
  const season = seasonFromMonth(Math.min(11, Math.max(0, date.month - 1)));
  const seasonColor = SEASON_ACCENT[season];

  useEffect(() => {
    if (iconRef.current) {
      gsap.to(iconRef.current, {
        rotate: open ? 135 : 0,
        scale: open ? 0.92 : 1,
        duration: 0.45,
        ease: "back.out(1.8)",
      });
    }
    if (!open || !panelRef.current) return;
    const items = panelRef.current.querySelectorAll("[data-settings-item]");
    const tl = gsap.timeline();
    tl.fromTo(
      panelRef.current,
      { autoAlpha: 0, y: -12, scale: 0.965, filter: "blur(12px)" },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        filter: "blur(0px)",
        duration: 0.34,
        ease: "back.out(1.55)",
      },
    ).fromTo(
      items,
      { autoAlpha: 0, y: 8 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.28,
        stagger: 0.035,
        ease: "power2.out",
      },
      "-=0.18",
    );
    if (sweepRef.current) {
      tl.fromTo(
        sweepRef.current,
        { xPercent: -140, opacity: 0 },
        { xPercent: 145, opacity: 0.65, duration: 0.9, ease: "power2.out" },
        0.04,
      );
    }
  }, [open]);

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
    <div className="anim-rise absolute right-5 top-5 text-right">
      <button
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => {
          if (!iconRef.current || open) return;
          gsap.to(iconRef.current, { rotate: 28, duration: 0.25, ease: "power2.out" });
        }}
        onMouseLeave={() => {
          if (!iconRef.current || open) return;
          gsap.to(iconRef.current, { rotate: 0, duration: 0.35, ease: "elastic.out(1,0.55)" });
        }}
        aria-label={open ? "Close" : "Settings"}
        className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-white/10 bg-white/[0.06] text-white/70 shadow-lg shadow-black/25 backdrop-blur-xl transition hover:border-[#9fd272]/35 hover:bg-white/10 hover:text-white active:scale-95"
      >
        <span ref={iconRef} className="grid place-items-center">
          {open ? <CloseIcon className="h-4 w-4" /> : <SettingsIcon className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          className="relative mt-2 w-[310px] overflow-hidden rounded-2xl border border-white/10 text-left opacity-0 shadow-2xl shadow-black/55 backdrop-blur-2xl ring-1 ring-[#9fd272]/10"
        >
          <div
            ref={sweepRef}
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/12 to-transparent opacity-0"
          />
          <div className="relative bg-gradient-to-br from-[#1c2a1f]/86 via-[#111b16]/88 to-[#0a100d]/92 px-4 pb-3.5 pt-4">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(159,210,114,0.16),transparent_34%),radial-gradient(circle_at_92%_22%,rgba(230,178,90,0.12),transparent_28%)]" />
            <div data-settings-item className="relative flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${mode === "live" ? "settings-pulse" : ""}`}
                    style={{ background: mode === "live" ? "#7ec85a" : "#6b7280" }}
                  />
                  <span className="text-[13px] font-semibold tracking-tight text-white">
                    Sterzing, IT
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-white/48">
                  {weather
                    ? `${Math.round(weather.tempC)}°C · ${weather.sky}`
                    : "loading"}
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.055] px-2 py-1 text-[11px] font-semibold text-white/62">
                <WindIcon className="h-3.5 w-3.5 text-[#9fd272]" />
                {weather ? `${Math.round(weather.windKmh)} km/h` : "--"}
              </div>
            </div>
          </div>

          <div className="space-y-4 bg-[#0a100d]/78 px-4 pb-4 pt-3.5">
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
        @media (prefers-reduced-motion: reduce) {
          .settings-pulse { animation: none; }
        }
      `}</style>
    </div>
  );
}
