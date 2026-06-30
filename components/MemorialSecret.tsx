"use client";

import { useEffect, useMemo, useState } from "react";
import { CloseIcon } from "./Icons";

// A quiet, hidden in-memoriam panel — revealed only by finding and clicking the
// white peace dove gliding over the island. Calm and dignified by design.
const IMAGE_SRC = "/memorial/franz.jpg";

// Slow-rising embers — soft golden sparks that drift up like candlelight. Seeded
// so they're deterministic (no hydration mismatch) yet feel scattered.
function buildEmbers(n: number) {
  let seed = 7919;
  const rng = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  return Array.from({ length: n }, () => ({
    left: Math.round(rng() * 1000) / 10, // %
    size: Math.round((1.4 + rng() * 2.6) * 10) / 10, // px
    delay: Math.round(rng() * 9000) / 1000, // s
    dur: Math.round((7 + rng() * 7) * 1000) / 1000, // s
    drift: Math.round((rng() * 40 - 20) * 10) / 10, // px sideways
    opacity: Math.round((0.25 + rng() * 0.5) * 100) / 100,
  }));
}

export default function MemorialSecret({ onClose }: { onClose: () => void }) {
  const [imgOk, setImgOk] = useState(true);
  const embers = useMemo(() => buildEmbers(22), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="memorial-root fixed inset-0 z-[60] grid place-items-center p-4"
      onClick={onClose}
    >
      <div className="memorial-veil" />

      {/* slow light rays + warm halo breathing behind the card */}
      <div className="memorial-rays" aria-hidden />
      <div className="memorial-halo" aria-hidden />

      {/* a single white dove gliding across, high above the card */}
      <svg className="memorial-dove" viewBox="0 0 64 40" aria-hidden>
        <path
          d="M2 22c10 2 16-2 22-9 1 6 4 9 9 9 6 0 10-4 14-9-1 8-3 14-9 18 7-1 12-4 16-10-2 12-12 18-24 18-15 0-26-7-28-17z"
          fill="rgba(255,255,255,0.92)"
        />
      </svg>

      {/* drifting embers */}
      <div className="memorial-embers" aria-hidden>
        {embers.map((e, i) => (
          <span
            key={i}
            className="memorial-ember"
            style={
              {
                left: `${e.left}%`,
                width: `${e.size}px`,
                height: `${e.size}px`,
                opacity: e.opacity,
                animationDelay: `${e.delay}s`,
                animationDuration: `${e.dur}s`,
                "--drift": `${e.drift}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div
        className="memorial-card relative z-10 w-full max-w-[440px] overflow-hidden rounded-2xl border border-[#e7dcc6]/15 bg-[#161310]/85 p-7 text-center shadow-2xl shadow-black/60 backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          <CloseIcon className="h-4 w-4" />
        </button>

        {/* candle flame */}
        <div className="memorial-flame mx-auto mb-4" aria-hidden>
          <span className="memorial-flame-glow" />
          <span className="memorial-flame-body" />
        </div>

        <p className="memorial-kicker mb-3 text-[11px] uppercase text-[#d9c79a]/80">
          In liebevoller Erinnerung
        </p>

        {/* the card itself already carries the verse, names and dates */}
        <div className="memorial-photo mx-auto overflow-hidden rounded-xl border border-[#e7dcc6]/20">
          {imgOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={IMAGE_SRC}
              alt="In Erinnerung an Franz Plattner"
              className="block h-full w-full object-contain"
              onError={() => setImgOk(false)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <p className="text-lg font-medium text-[#f3ead4]">Franz Plattner</p>
              <p className="text-sm text-[#d9c79a]/70">14. Januar 1947 — 25. Juni 2026</p>
              <p className="mt-3 text-[11px] leading-relaxed text-white/40">
                Bild nach{" "}
                <code className="rounded bg-white/10 px-1">public/memorial/franz.jpg</code>{" "}
                legen.
              </p>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .memorial-root {
          animation: memorial-fade 700ms ease both;
        }
        .memorial-veil {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 50% 42%, rgba(60, 48, 30, 0.5), transparent 60%),
            rgba(6, 5, 4, 0.78);
          backdrop-filter: blur(8px);
        }
        .memorial-card {
          animation: memorial-rise 900ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        /* soft warm halo that gently breathes behind the card */
        .memorial-halo {
          position: absolute;
          left: 50%;
          top: 46%;
          width: min(80vw, 620px);
          height: min(80vw, 620px);
          transform: translate(-50%, -50%);
          pointer-events: none;
          background: radial-gradient(
            circle,
            rgba(255, 184, 104, 0.16),
            rgba(255, 150, 70, 0.06) 38%,
            transparent 66%
          );
          animation: memorial-breathe 6.5s ease-in-out infinite, memorial-fade 1200ms ease both;
        }
        /* slow rotating volumetric-ish light rays */
        .memorial-rays {
          position: absolute;
          left: 50%;
          top: 44%;
          width: 150vmax;
          height: 150vmax;
          transform: translate(-50%, -50%);
          pointer-events: none;
          opacity: 0.5;
          background: repeating-conic-gradient(
            from 0deg at 50% 50%,
            rgba(255, 210, 150, 0.05) 0deg,
            rgba(255, 210, 150, 0) 7deg,
            rgba(255, 210, 150, 0) 18deg
          );
          mask-image: radial-gradient(circle, #000 8%, transparent 52%);
          -webkit-mask-image: radial-gradient(circle, #000 8%, transparent 52%);
          animation: memorial-spin 64s linear infinite, memorial-fade 1600ms ease both;
        }

        /* the gliding dove */
        .memorial-dove {
          position: absolute;
          top: 14%;
          left: -8%;
          width: 64px;
          height: 40px;
          filter: drop-shadow(0 2px 10px rgba(0, 0, 0, 0.4));
          opacity: 0;
          animation: memorial-glide 13s ease-in-out 600ms infinite;
        }

        /* embers */
        .memorial-embers {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }
        .memorial-ember {
          position: absolute;
          bottom: -12px;
          border-radius: 999px;
          background: radial-gradient(circle, #ffd89a, rgba(255, 168, 80, 0.2) 70%, transparent);
          box-shadow: 0 0 8px rgba(255, 180, 100, 0.7);
          animation-name: memorial-rise-ember;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }

        /* heading fades + tracks its letters open */
        .memorial-kicker {
          letter-spacing: 0.05em;
          animation: memorial-track 1400ms cubic-bezier(0.22, 1, 0.36, 1) 250ms both;
        }
        .memorial-photo {
          width: 100%;
          max-height: 70vh;
          background: #0c0a08;
        }
        .memorial-photo img {
          max-height: 70vh;
        }

        /* a small, gently flickering candle flame */
        .memorial-flame {
          position: relative;
          width: 22px;
          height: 30px;
        }
        .memorial-flame-glow {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 46px;
          height: 46px;
          transform: translate(-50%, -50%);
          border-radius: 999px;
          background: radial-gradient(circle, rgba(255, 196, 110, 0.45), transparent 68%);
          animation: memorial-glow 2.4s ease-in-out infinite;
        }
        .memorial-flame-body {
          position: absolute;
          left: 50%;
          bottom: 0;
          width: 13px;
          height: 22px;
          transform: translateX(-50%);
          border-radius: 50% 50% 50% 50% / 64% 64% 36% 36%;
          background: linear-gradient(to top, #ffd27a, #ff9b3d 55%, #ffe7b0);
          box-shadow: 0 0 14px rgba(255, 168, 80, 0.7);
          transform-origin: 50% 100%;
          animation: memorial-flicker 1.8s ease-in-out infinite;
        }

        @keyframes memorial-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes memorial-rise {
          from { opacity: 0; transform: translateY(18px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes memorial-flicker {
          0%, 100% { transform: translateX(-50%) scale(1) rotate(-1deg); }
          50% { transform: translateX(-50%) scale(1.06, 0.96) rotate(1.5deg); }
        }
        @keyframes memorial-glow {
          0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(0.92); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.08); }
        }
        @keyframes memorial-breathe {
          0%, 100% { opacity: 0.7; transform: translate(-50%, -50%) scale(0.96); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.06); }
        }
        @keyframes memorial-spin {
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes memorial-rise-ember {
          0% { transform: translate(0, 0) scale(0.6); opacity: 0; }
          12% { opacity: 1; }
          80% { opacity: 0.9; }
          100% { transform: translate(var(--drift), -78vh) scale(1.05); opacity: 0; }
        }
        @keyframes memorial-glide {
          0% { transform: translate(0, 0) rotate(-4deg); opacity: 0; }
          12% { opacity: 0.85; }
          50% { transform: translate(60vw, -6vh) rotate(2deg); opacity: 0.85; }
          88% { opacity: 0.7; }
          100% { transform: translate(122vw, -2vh) rotate(-3deg); opacity: 0; }
        }
        @keyframes memorial-track {
          from { opacity: 0; letter-spacing: 0.42em; }
          to { opacity: 1; letter-spacing: 0.25em; }
        }
        @media (prefers-reduced-motion: reduce) {
          .memorial-root, .memorial-card,
          .memorial-flame-body, .memorial-flame-glow,
          .memorial-halo, .memorial-rays, .memorial-dove,
          .memorial-ember, .memorial-kicker {
            animation: none;
          }
          .memorial-dove { display: none; }
          .memorial-embers { display: none; }
        }
      `}</style>
    </div>
  );
}
