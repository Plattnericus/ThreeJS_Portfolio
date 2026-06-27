"use client";

import { MinusIcon, PlusIcon, StarIcon } from "./Icons";

// Minimal, professional HUD. The star value reflects the tracked repo. The
// +/- editor is a DEV control, shown only when enabled via env (see page.tsx).
export default function Hud({
  stars,
  devControls,
  onChange,
}: {
  stars: number;
  devControls: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <>
      {/* Star count — always shown, read-only by default */}
      <div className="anim-rise delay-1 absolute bottom-6 left-6 flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2.5 backdrop-blur-xl">
        {devControls && (
          <button
            onClick={() => onChange(stars - 1)}
            className="grid h-6 w-6 place-items-center rounded-md border border-white/15 text-white/70 transition hover:bg-white/10"
            aria-label="Remove a star"
          >
            <MinusIcon className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="flex items-center gap-2">
          <StarIcon className="h-4 w-4 text-white/40" />
          <span className="tabular-nums text-base font-medium text-white">
            {stars.toLocaleString()}
          </span>
        </div>
        {devControls && (
          <button
            onClick={() => onChange(stars + 1)}
            className="grid h-6 w-6 place-items-center rounded-md border border-white/15 text-white/70 transition hover:bg-white/10"
            aria-label="Add a star"
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </>
  );
}
