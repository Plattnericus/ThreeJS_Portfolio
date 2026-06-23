"use client";

import { useState } from "react";
import { seasonFromMonth, type Sky, type Weather } from "@/lib/weather";

const SKIES: Sky[] = ["clear", "clouds", "fog", "rain", "snow", "storm"];

export type ManualDate = {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  hour: number; // 0..23
};

// Always-available settings panel. Type the date/time/year and pick conditions;
// "Live" follows real Sterzing weather instead.
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

  const num = (
    label: string,
    key: keyof ManualDate,
    min: number,
    max: number,
  ) => (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-white/45">
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={date[key]}
        onChange={(e) =>
          onDate({ ...date, [key]: Number(e.target.value) || 0 })
        }
        className="w-full rounded border border-white/15 bg-white/5 px-2 py-1 text-sm text-white outline-none focus:border-canopy"
      />
    </label>
  );

  return (
    <div className="absolute right-5 top-5 text-right">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white/80 backdrop-blur-sm hover:bg-white/10"
      >
        {open ? "Close" : "Settings"}
      </button>

      {open && (
        <div className="mt-2 w-64 space-y-3 rounded-lg border border-white/10 bg-black/50 p-4 text-left backdrop-blur-md">
          <div>
            <div className="text-xs font-medium text-white/80">Sterzing, IT</div>
            <div className="text-[11px] text-white/50">
              {weather
                ? `${Math.round(weather.tempC)}°C · ${weather.sky} · ${Math.round(
                    weather.windKmh,
                  )} km/h`
                : "loading…"}
            </div>
          </div>

          <div className="flex gap-1.5">
            {(["live", "manual"] as const).map((m) => (
              <button
                key={m}
                onClick={() => onMode(m)}
                className={`flex-1 rounded px-2 py-1 text-xs capitalize ${
                  mode === m
                    ? "bg-canopy text-black"
                    : "border border-white/15 text-white/70 hover:bg-white/10"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div
            className={mode === "manual" ? "space-y-2" : "space-y-2 pointer-events-none opacity-40"}
          >
            <div className="grid grid-cols-3 gap-2">
              {num("Day", "day", 1, 31)}
              {num("Month", "month", 1, 12)}
              {num("Year", "year", 1900, 2200)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {num("Hour", "hour", 0, 23)}
              <div className="flex flex-col justify-end">
                <span className="text-[10px] uppercase tracking-wide text-white/45">
                  Season
                </span>
                <span className="py-1 text-sm capitalize text-canopy">
                  {season}
                </span>
              </div>
            </div>

            <div>
              <span className="text-[10px] uppercase tracking-wide text-white/45">
                Conditions
              </span>
              <div className="mt-1 grid grid-cols-3 gap-1.5">
                {SKIES.map((s) => (
                  <button
                    key={s}
                    onClick={() => onSky(s)}
                    className={`rounded px-1.5 py-1 text-[11px] capitalize ${
                      manualSky === s
                        ? "bg-white/85 text-black"
                        : "border border-white/15 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
