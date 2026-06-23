"use client";

// Minimal, edge-anchored HUD. The +/- controls preview growth before the repo
// has real stars; once the repo is live, the GitHub count drives everything.
export default function Hud({
  stars,
  live,
  onChange,
}: {
  stars: number;
  live: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <>
      <div className="pointer-events-none absolute left-5 top-5 select-none">
        <h1 className="text-lg font-semibold tracking-tight text-white">
          Star Tree
        </h1>
        <p className="text-xs text-white/60">Plattnericus/ThreeJS_Portfolio</p>
      </div>

      <div className="absolute bottom-5 left-5 flex items-center gap-3 rounded-lg border border-white/10 bg-black/30 px-4 py-3 backdrop-blur-sm">
        <button
          onClick={() => onChange(stars - 1)}
          className="grid h-7 w-7 place-items-center rounded border border-white/15 text-white/80 hover:bg-white/10"
          aria-label="Remove a star"
        >
          –
        </button>
        <div className="min-w-[90px] text-center">
          <div className="text-xl font-semibold text-white">{stars}</div>
          <div className="text-[10px] uppercase tracking-wide text-white/50">
            {stars === 1 ? "star" : "stars"}
          </div>
        </div>
        <button
          onClick={() => onChange(stars + 1)}
          className="grid h-7 w-7 place-items-center rounded border border-white/15 text-white/80 hover:bg-white/10"
          aria-label="Add a star"
        >
          +
        </button>
      </div>

      <div className="absolute bottom-5 right-5 text-right text-[11px] text-white/45">
        {live ? "live from GitHub" : "preview — repo not live yet"}
      </div>
    </>
  );
}
