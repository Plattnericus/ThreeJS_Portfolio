"use client";

import { useEffect, useState } from "react";
import { CloseIcon } from "./Icons";

// A quiet, hidden in-memoriam panel — revealed only by finding and clicking the
// white peace dove gliding over the island. Calm and dignified by design.
const IMAGE_SRC = "/memorial/franz.jpg";

export default function MemorialSecret({ onClose }: { onClose: () => void }) {
  const [imgOk, setImgOk] = useState(true);

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

        <p className="mb-3 text-[11px] uppercase tracking-[0.25em] text-[#d9c79a]/70">
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
              <p className="text-sm text-[#d9c79a]/70">14. Januar 1947 — 25. Juli 2026</p>
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
        @media (prefers-reduced-motion: reduce) {
          .memorial-root, .memorial-card,
          .memorial-flame-body, .memorial-flame-glow {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
