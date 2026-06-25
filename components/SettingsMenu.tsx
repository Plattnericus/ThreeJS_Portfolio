"use client";

import { useState } from "react";
import { seasonFromMonth, type Sky, type Weather } from "@/lib/weather";
import { CloseIcon, SettingsIcon } from "./Icons";

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
  const season = seasonFromMonth(Math.min(11, Math.max(0, date.month - 1)));
  const seasonColor = SEASON_ACCENT[season];

  const num = (
    label: string,
    key: keyof ManualDate,
    min: number,
    max: number,
  ) => (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/40">
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={date[key]}
        onChange={(e) => onDate({ ...date, [key]: Number(e.target.value) || 0 })}
        className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm font-medium tabular-nums text-white outline-none transition focus:border-[#6fae4f]/70 focus:bg-white/[0.07] focus:ring-2 focus:ring-[#6fae4f]/20"
      />
    </label>
  );

  return (
    <div className="anim-rise absolute right-5 top-5 text-right">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close" : "Settings"}
        className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-white/70 backdrop-blur-xl transition hover:bg-white/10 hover:text-white active:scale-95"
      >
        {open ? <CloseIcon className="h-4 w-4" /> : <SettingsIcon className="h-4 w-4" />}
      </button>

      {open && (
        <div className="anim-rise mt-2 w-[270px] overflow-hidden rounded-2xl border border-white/10 text-left shadow-2xl shadow-black/50 backdrop-blur-2xl ring-1 ring-[#6fae4f]/10">
          {/* header — soft foliage-tinted gradient */}
          <div className="bg-gradient-to-br from-[#1c2a1f]/80 via-[#142019]/80 to-[#0e1512]/85 px-4 pb-3.5 pt-4">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${mode === "live" ? "settings-pulse" : ""}`}
                style={{ background: mode === "live" ? "#7ec85a" : "#6b7280" }}
              />
              <span className="text-[13px] font-semibold tracking-tight text-white">
                Sterzing, IT
              </span>
            </div>
            <div className="mt-1 pl-4 text-[11px] text-white/50">
              {weather
                ? `${Math.round(weather.tempC)}°C · ${weather.sky} · ${Math.round(weather.windKmh)} km/h`
                : "loading…"}
            </div>
          </div>

          <div className="space-y-3.5 bg-[#0c1310]/70 px-4 pb-4 pt-3.5">
            {/* live / manual segmented control */}
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
              {(["live", "manual"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => onMode(m)}
                  className={`rounded-lg py-1.5 text-xs font-semibold capitalize transition ${
                    mode === m
                      ? "bg-[#6fae4f] text-[#0c1310] shadow-sm shadow-[#6fae4f]/30"
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
              <div className="grid grid-cols-3 gap-2">
                {num("Day", "day", 1, 31)}
                {num("Month", "month", 1, 12)}
                {num("Year", "year", 1900, 2200)}
              </div>
              <div className="grid grid-cols-2 items-end gap-2">
                {num("Hour", "hour", 0, 23)}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/40">
                    Season
                  </span>
                  <span
                    className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-semibold capitalize"
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

              <div>
                <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/40">
                  Conditions
                </span>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  {SKIES.map((s) => {
                    const active = manualSky === s;
                    const c = SKY_ACCENT[s];
                    return (
                      <button
                        key={s}
                        onClick={() => onSky(s)}
                        className="flex items-center justify-center gap-1.5 rounded-lg border py-1.5 text-[11px] font-medium capitalize transition"
                        style={
                          active
                            ? { color: c, borderColor: c + "66", background: c + "1f" }
                            : { color: "rgba(255,255,255,0.6)", borderColor: "rgba(255,255,255,0.1)", background: "transparent" }
                        }
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full transition"
                          style={{ background: active ? c : "rgba(255,255,255,0.25)" }}
                        />
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
