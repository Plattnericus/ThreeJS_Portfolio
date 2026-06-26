"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { SearchIcon, StarIcon } from "./Icons";

export type SearchResult = {
  index: number;
  name: string;
  tier?: string;
  contributor?: boolean;
};

export default function SearchBar({
  query,
  onQuery,
  results,
  activeIndex,
  onActive,
  onSelect,
}: {
  query: string;
  onQuery: (q: string) => void;
  results: SearchResult[];
  activeIndex: number;
  onActive: (index: number) => void;
  onSelect: (result: SearchResult) => void;
}) {
  const [focused, setFocused] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const glowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const open = focused && results.length > 0;

  const activeResult = useMemo(
    () =>
      activeIndex >= 0
        ? results.find((result) => result.index === activeIndex) ?? null
        : null,
    [activeIndex, results],
  );

  useEffect(() => {
    if (!panelRef.current) return;
    if (open) {
      const tl = gsap.timeline();
      tl.fromTo(
        panelRef.current,
        { autoAlpha: 0, y: -10, scale: 0.975, filter: "blur(10px)" },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          filter: "blur(0px)",
          duration: 0.32,
          ease: "back.out(1.45)",
        },
      )
        .fromTo(
          rowsRef.current.filter(Boolean),
          { autoAlpha: 0, x: -10, scale: 0.985 },
          {
            autoAlpha: 1,
            x: 0,
            scale: 1,
            duration: 0.24,
            stagger: 0.025,
            ease: "power2.out",
          },
          "-=0.16",
        );
      if (glowRef.current) {
        tl.fromTo(
          glowRef.current,
          { xPercent: -130, opacity: 0 },
          { xPercent: 130, opacity: 0.75, duration: 0.8, ease: "power2.out" },
          0.04,
        );
      }
    }
  }, [open, results.length]);

  useEffect(() => {
    if (!open || activeResult) return;
    onActive(results[0]?.index ?? -1);
  }, [activeResult, onActive, open, results]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const row = rowsRef.current.find((el) => el?.dataset.index === String(activeIndex));
    if (!row) return;
    gsap.fromTo(
      row,
      { scale: 0.992 },
      { scale: 1, duration: 0.22, ease: "back.out(2)" },
    );
  }, [activeIndex, open]);

  const cycle = (dir: 1 | -1) => {
    if (!results.length) return;
    const current = results.findIndex((result) => result.index === activeIndex);
    const next = current < 0 ? 0 : (current + dir + results.length) % results.length;
    onActive(results[next].index);
  };

  const pick = (result: SearchResult | null) => {
    if (!result) return;
    onSelect(result);
    setFocused(false);
    inputRef.current?.blur();
  };

  return (
    <div ref={rootRef} className="anim-rise-x absolute left-1/2 top-5 z-30 -translate-x-1/2">
      <div className="relative w-[min(92vw,380px)]">
        <div className="relative overflow-hidden rounded-full border border-white/12 bg-[#0d1410]/55 shadow-2xl shadow-black/35 backdrop-blur-2xl transition focus-within:border-[#9fd272]/55 focus-within:bg-[#0d1410]/72">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_50%,rgba(159,210,114,0.24),transparent_34%),linear-gradient(90deg,rgba(255,255,255,0.08),transparent_42%)] opacity-70" />
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b9e78b]" />
          <input
            ref={inputRef}
            value={query}
            onPointerDown={() => setFocused(true)}
            onFocus={() => setFocused(true)}
            onBlur={() =>
              window.setTimeout(() => {
                if (document.activeElement !== inputRef.current) {
                  setFocused(false);
                  onActive(-1);
                }
              }, 120)
            }
            onChange={(e) => {
              onQuery(e.target.value);
              setFocused(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Tab" && open) {
                e.preventDefault();
                cycle(e.shiftKey ? -1 : 1);
              } else if (e.key === "ArrowDown" && open) {
                e.preventDefault();
                cycle(1);
              } else if (e.key === "ArrowUp" && open) {
                e.preventDefault();
                cycle(-1);
              } else if (e.key === "Enter" && open) {
                e.preventDefault();
                pick(activeResult);
              } else if (e.key === "Escape") {
                setFocused(false);
                inputRef.current?.blur();
              }
            }}
            placeholder="Search a house"
            className="relative h-11 w-full bg-transparent pl-11 pr-4 text-sm font-medium text-white placeholder-white/38 outline-none"
          />
        </div>

        {open && (
          <div
            ref={panelRef}
            className="absolute left-0 right-0 top-[calc(100%+8px)] overflow-hidden rounded-2xl border border-white/12 bg-[#0a100d]/82 text-left opacity-0 shadow-2xl shadow-black/55 backdrop-blur-2xl"
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(159,210,114,0.16),transparent_34%),radial-gradient(circle_at_88%_12%,rgba(230,178,90,0.18),transparent_28%)]" />
            <div
              ref={glowRef}
              className="pointer-events-none absolute inset-y-0 left-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/14 to-transparent opacity-0"
            />
            <div className="relative max-h-72 overflow-y-auto p-1.5">
              {results.map((result, i) => {
                const active = result.index === activeIndex;
                return (
                  <button
                    key={result.index}
                    ref={(el) => {
                      rowsRef.current[i] = el;
                    }}
                    data-index={result.index}
                    onMouseEnter={() => onActive(result.index)}
                    onClick={() => pick(result)}
                    className={`group grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                      active
                        ? "bg-[#9fd272]/18 text-white shadow-inner shadow-[#9fd272]/10"
                        : "text-white/68 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    <span
                      className={`grid h-7 w-7 place-items-center rounded-full border transition ${
                        active
                          ? "border-[#9fd272]/45 bg-[#9fd272]/18 text-[#c9f29b]"
                          : "border-white/10 bg-white/[0.04] text-white/36"
                      }`}
                    >
                      <StarIcon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{result.name}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-white/38">
                        House {result.index + 1}
                        {result.tier ? ` · ${result.tier}` : ""}
                        {result.contributor ? " · contributor" : ""}
                      </span>
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums transition ${
                        active
                          ? "border-[#e6b25a]/45 bg-[#e6b25a]/16 text-[#ffe0a1]"
                          : "border-white/10 text-white/32"
                      }`}
                    >
                      #{result.index + 1}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="relative border-t border-white/10 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.16em] text-white/32">
              Tab cycles · Enter selects
            </div>
          </div>
        )}

        {focused && results.length === 0 && (
          <div className="absolute left-0 right-0 top-[calc(100%+8px)] rounded-2xl border border-white/10 bg-[#0a100d]/82 px-4 py-3 text-center text-xs text-white/45 shadow-xl shadow-black/40 backdrop-blur-2xl">
            No houses found
          </div>
        )}
      </div>
    </div>
  );
}
