"use client";

import gsap from "gsap";
import { useEffect, useMemo, useRef } from "react";
import { CloseIcon } from "./Icons";

// Hidden in-memoriam panel revealed by the white dove.
const MEMORIAL_LINK = "https://www.trauerhilfe.it/verstorbene/franz-plattner-gossensass/";

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

function buildLightThreads(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    top: 12 + i * 7.2,
    delay: i * 0.18,
    scale: 0.42 + (i % 4) * 0.12,
    opacity: 0.08 + (i % 3) * 0.035,
  }));
}

export default function MemorialSecret({ onClose }: { onClose: () => void }) {
  const embers = useMemo(() => buildEmbers(22), []);
  const threads = useMemo(() => buildLightThreads(9), []);
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const textPanelRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !rootRef.current) return;

    const ctx = gsap.context(() => {
      const copyItems = copyRef.current
        ? Array.from(copyRef.current.querySelectorAll(".memorial-copy-item"))
        : [];

      gsap.set(rootRef.current, { autoAlpha: 1 });
      gsap.set([cardRef.current, textPanelRef.current, copyItems, closeRef.current], {
        willChange: "transform, opacity",
      });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.fromTo(rootRef.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.36 })
        .fromTo(
          cardRef.current,
          { autoAlpha: 0, y: 34, scale: 0.965, rotateX: 5 },
          { autoAlpha: 1, y: 0, scale: 1, rotateX: 0, duration: 0.85 },
          0.08,
        )
        .fromTo(
          textPanelRef.current,
          { autoAlpha: 0, y: 20, scale: 0.94 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.72 },
          0.24,
        )
        .fromTo(
          copyItems,
          { autoAlpha: 0, y: 16 },
          { autoAlpha: 1, y: 0, duration: 0.58, stagger: 0.075 },
          0.34,
        )
        .fromTo(
          closeRef.current,
          { autoAlpha: 0, scale: 0.82 },
          { autoAlpha: 1, scale: 1, duration: 0.35 },
          0.5,
        );

      gsap.fromTo(
        ".memorial-gsap-line",
        { scaleX: 0, transformOrigin: "left center" },
        { scaleX: 1, duration: 1.1, ease: "expo.out", stagger: 0.08, delay: 0.36 },
      );
      gsap.fromTo(
        ".memorial-tree-stroke",
        { strokeDashoffset: 1 },
        { strokeDashoffset: 0, duration: 1.35, ease: "power2.out", stagger: 0.075, delay: 0.32 },
      );
      gsap.fromTo(
        ".memorial-leaf-dot",
        { autoAlpha: 0, scale: 0.4, transformOrigin: "50% 50%" },
        { autoAlpha: 1, scale: 1, duration: 0.55, ease: "back.out(1.8)", stagger: 0.035, delay: 0.9 },
      );
      gsap.to(".memorial-tree-glow", {
        autoAlpha: 0.78,
        scale: 1.08,
        duration: 3.4,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
        transformOrigin: "50% 50%",
      });
      gsap.to(".memorial-thread", {
        xPercent: 10,
        opacity: (i) => 0.11 + (i % 4) * 0.03,
        duration: 4.2,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
        stagger: 0.18,
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={rootRef}
      className="memorial-root fixed inset-0 z-[60] grid place-items-center p-3 opacity-0 sm:p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="In liebevoller Erinnerung an Franz Plattner"
    >
      <div className="memorial-veil" />
      <div className="memorial-texture" aria-hidden />

      <div className="memorial-threads" aria-hidden>
        {threads.map((thread, i) => (
          <span
            key={i}
            className="memorial-thread memorial-gsap-line"
            style={
              {
                top: `${thread.top}%`,
                animationDelay: `${thread.delay}s`,
                opacity: thread.opacity,
                "--thread-scale": thread.scale,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div className="memorial-rays" aria-hidden />
      <div className="memorial-halo" aria-hidden />

      <svg className="memorial-dove" viewBox="0 0 64 40" aria-hidden>
        <path
          d="M2 22c10 2 16-2 22-9 1 6 4 9 9 9 6 0 10-4 14-9-1 8-3 14-9 18 7-1 12-4 16-10-2 12-12 18-24 18-15 0-26-7-28-17z"
          fill="rgba(255,255,255,0.92)"
        />
      </svg>

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
        ref={cardRef}
        className="memorial-card relative z-10 w-full max-w-[900px] overflow-hidden rounded-2xl border border-[#e7dcc6]/16 bg-[#15110d]/90 p-3 text-[#f5ecd8] shadow-2xl shadow-black/65 backdrop-blur-xl sm:p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="memorial-card-sheen" aria-hidden />
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-black/20 text-white/55 transition hover:bg-white/10 hover:text-white"
        >
          <CloseIcon className="h-4 w-4" />
        </button>

        <div ref={textPanelRef} className="memorial-layout memorial-text-panel">
          <div className="memorial-tree-art" aria-hidden>
            <svg viewBox="0 0 320 360" className="h-full w-full">
              <defs>
                <radialGradient id="memorialTreeGlow" cx="50%" cy="32%" r="54%">
                  <stop offset="0" stopColor="rgba(255,226,165,0.72)" />
                  <stop offset="0.42" stopColor="rgba(168,126,67,0.18)" />
                  <stop offset="1" stopColor="rgba(0,0,0,0)" />
                </radialGradient>
                <linearGradient id="memorialTreeStroke" x1="160" y1="330" x2="160" y2="54">
                  <stop offset="0" stopColor="#7c5c34" />
                  <stop offset="0.52" stopColor="#c7aa72" />
                  <stop offset="1" stopColor="#f2dfad" />
                </linearGradient>
              </defs>
              <ellipse className="memorial-tree-glow" cx="160" cy="126" rx="116" ry="108" fill="url(#memorialTreeGlow)" />
              <path className="memorial-tree-stroke memorial-root-line" pathLength={1} d="M160 323C151 294 151 259 160 232C170 198 164 165 158 132" />
              <path className="memorial-tree-stroke" pathLength={1} d="M160 242C128 252 99 275 73 318" />
              <path className="memorial-tree-stroke" pathLength={1} d="M160 244C194 253 221 278 249 321" />
              <path className="memorial-tree-stroke" pathLength={1} d="M154 175C121 157 99 126 79 88" />
              <path className="memorial-tree-stroke" pathLength={1} d="M160 152C184 120 210 96 247 73" />
              <path className="memorial-tree-stroke" pathLength={1} d="M156 128C135 101 124 75 118 48" />
              <path className="memorial-tree-stroke" pathLength={1} d="M162 123C188 99 205 72 211 43" />
              <path className="memorial-tree-stroke" pathLength={1} d="M153 191C111 200 81 221 51 253" />
              <path className="memorial-tree-stroke" pathLength={1} d="M164 192C202 184 233 193 270 220" />
              {[
                [78, 87, 9],
                [98, 112, 6],
                [118, 48, 8],
                [132, 75, 5],
                [210, 44, 8],
                [230, 64, 6],
                [248, 74, 9],
                [205, 96, 5],
                [50, 253, 7],
                [82, 223, 5],
                [270, 220, 8],
                [238, 196, 5],
                [155, 129, 6],
              ].map(([cx, cy, r], i) => (
                <circle key={i} className="memorial-leaf-dot" cx={cx} cy={cy} r={r} />
              ))}
            </svg>
          </div>

          <section ref={copyRef} className="memorial-copy flex flex-col justify-between p-5 sm:p-7">
            <div>
              <div className="memorial-copy-item memorial-overline">In liebevoller Erinnerung</div>
              <h2 className="memorial-copy-item mt-3 text-[clamp(2rem,4.2vw,4.35rem)] font-semibold leading-[0.95] text-[#fff8e8]">
                Franz Plattner
              </h2>
              <p className="memorial-copy-item mt-4 text-sm text-[#ddc996] sm:text-base">
                14. Januar 1947 · 25. Juni 2026
              </p>

              <div className="memorial-copy-item memorial-divider memorial-gsap-line my-6" />

              <p className="memorial-copy-item memorial-body-copy max-w-[38rem] text-base leading-7 text-[#f4ead3]/84 sm:text-lg sm:leading-8">
                Wie ein Baum, der tief verwurzelt steht, bleiben Spuren von Franz
                in den Menschen, die ihn lieben. Seine Geschichten, seine Wärme
                und die stillen Momente mit ihm wachsen weiter wie Äste im Licht.
                Was bleibt, ist Dankbarkeit: für Nähe, für Stärke und für alles,
                was im Herzen weiterlebt.
              </p>

              <div className="memorial-copy-item memorial-quote mt-6">
                <span className="memorial-gsap-line" aria-hidden />
                <p>Ein Leben endet, doch Liebe schlägt weiter Wurzeln.</p>
              </div>

              <a
                className="memorial-copy-item memorial-link mt-6 inline-flex w-fit items-center gap-2 rounded-lg border border-[#e7dcc6]/18 bg-[#f6d28b]/10 px-4 py-2.5 text-sm font-medium text-[#ffe7b0] transition hover:border-[#f6d28b]/42 hover:bg-[#f6d28b]/16 hover:text-[#fff7dc]"
                href={MEMORIAL_LINK}
                target="_blank"
                rel="noopener noreferrer"
              >
                Gedenkseite öffnen
                <span aria-hidden>↗</span>
              </a>
            </div>

            <div className="memorial-copy-item memorial-candle-row mt-8 flex items-center gap-4">
              <div className="memorial-flame" aria-hidden>
                <span className="memorial-flame-glow" />
                <span className="memorial-flame-body" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#fff4d6]">Frieden und Licht</p>
                <p className="mt-1 text-xs leading-5 text-[#d9c79a]/68">
                  Ein ruhiger Moment im Portfolio, verborgen hinter der weißen Taube.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <style jsx>{`
        .memorial-root {
          perspective: 1400px;
        }
        .memorial-veil {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(125deg, rgba(8, 7, 5, 0.9), rgba(20, 15, 10, 0.84) 48%, rgba(5, 5, 4, 0.92)),
            radial-gradient(ellipse at 50% 38%, rgba(130, 92, 42, 0.22), transparent 58%);
          backdrop-filter: blur(9px);
        }
        .memorial-texture {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.18;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
          background-size: 46px 46px, 46px 46px;
          mask-image: linear-gradient(to bottom, transparent, #000 18%, #000 78%, transparent);
          -webkit-mask-image: linear-gradient(to bottom, transparent, #000 18%, #000 78%, transparent);
        }
        .memorial-card {
          transform-style: preserve-3d;
        }
        .memorial-card::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          border-radius: inherit;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.08),
            inset 0 -1px 0 rgba(0, 0, 0, 0.45);
        }
        .memorial-card-sheen {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(120deg, transparent 12%, rgba(255, 230, 180, 0.08) 34%, transparent 55%),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.04), transparent 42%);
        }
        .memorial-layout {
          position: relative;
          border-radius: 14px;
          border: 1px solid rgba(231, 220, 198, 0.1);
          background:
            radial-gradient(circle at 78% 22%, rgba(246, 210, 139, 0.12), transparent 32%),
            linear-gradient(145deg, rgba(255, 234, 184, 0.055), transparent 36%),
            linear-gradient(90deg, rgba(255, 255, 255, 0.035), transparent 38%),
            rgba(255, 255, 255, 0.025);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.06),
            inset 0 -1px 0 rgba(0, 0, 0, 0.32);
          overflow: hidden;
          isolation: isolate;
        }
        .memorial-text-panel {
          min-height: min(66vh, 520px);
          display: flex;
          align-items: stretch;
        }
        .memorial-text-panel::before {
          content: "";
          position: absolute;
          inset: 18px;
          border: 1px solid rgba(231, 220, 198, 0.06);
          border-radius: 12px;
          pointer-events: none;
        }
        .memorial-text-panel::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 42%;
          pointer-events: none;
          background:
            radial-gradient(ellipse at 22% 100%, rgba(125, 84, 42, 0.18), transparent 58%),
            linear-gradient(to top, rgba(0, 0, 0, 0.32), transparent);
        }
        .memorial-copy {
          position: relative;
          z-index: 2;
          width: min(100%, 660px);
        }
        .memorial-tree-art {
          position: absolute;
          z-index: 1;
          right: clamp(-82px, -6vw, -30px);
          bottom: -58px;
          width: min(46vw, 390px);
          height: min(58vh, 440px);
          opacity: 0.72;
          pointer-events: none;
          filter: drop-shadow(0 26px 50px rgba(0, 0, 0, 0.34));
        }
        .memorial-tree-stroke {
          fill: none;
          stroke: url(#memorialTreeStroke);
          stroke-width: 8;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          opacity: 0.78;
        }
        .memorial-root-line {
          stroke-width: 11;
          opacity: 0.86;
        }
        .memorial-leaf-dot {
          fill: rgba(246, 210, 139, 0.9);
          stroke: rgba(255, 246, 220, 0.38);
          stroke-width: 1.2;
          filter: drop-shadow(0 0 10px rgba(246, 210, 139, 0.22));
          opacity: 0;
        }
        .memorial-tree-glow {
          opacity: 0.46;
        }

        .memorial-halo {
          position: absolute;
          left: 50%;
          top: 46%;
          width: min(86vw, 860px);
          height: min(62vw, 520px);
          transform: translate(-50%, -50%);
          pointer-events: none;
          background:
            linear-gradient(90deg, transparent, rgba(255, 184, 104, 0.08), transparent),
            radial-gradient(ellipse at center, rgba(255, 184, 104, 0.16), transparent 68%);
          filter: blur(4px);
          animation: memorial-breathe 6.5s ease-in-out infinite;
        }
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
          animation: memorial-spin 64s linear infinite;
        }
        .memorial-threads {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }
        .memorial-thread {
          position: absolute;
          left: -8%;
          width: 116%;
          height: 1px;
          transform: scaleX(var(--thread-scale));
          background: linear-gradient(90deg, transparent, rgba(255, 236, 196, 0.72), transparent);
          box-shadow: 0 0 12px rgba(255, 207, 140, 0.28);
        }

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

        .memorial-overline {
          color: rgba(217, 199, 154, 0.82);
          font-size: 0.78rem;
          font-weight: 600;
          letter-spacing: 0;
        }
        .memorial-divider {
          height: 1px;
          width: min(18rem, 100%);
          background: linear-gradient(90deg, rgba(255, 231, 176, 0.72), transparent);
        }
        .memorial-quote {
          position: relative;
          border-left: 1px solid rgba(255, 231, 176, 0.28);
          padding: 1rem 0 1rem 1.1rem;
          color: rgba(255, 244, 214, 0.86);
          background: linear-gradient(90deg, rgba(255, 231, 176, 0.06), transparent);
        }
        .memorial-quote span {
          position: absolute;
          left: 0;
          top: 0;
          height: 1px;
          width: 68%;
          background: linear-gradient(90deg, rgba(255, 231, 176, 0.62), transparent);
        }
        .memorial-quote p {
          font-size: 1rem;
          line-height: 1.7;
        }
        .memorial-body-copy {
          text-wrap: pretty;
        }
        .memorial-link {
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.06),
            0 12px 32px rgba(0, 0, 0, 0.22);
        }

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
        @media (prefers-reduced-motion: reduce) {
          .memorial-root, .memorial-card,
          .memorial-flame-body, .memorial-flame-glow,
          .memorial-halo, .memorial-rays, .memorial-dove,
          .memorial-ember, .memorial-thread, .memorial-tree-glow {
            animation: none;
          }
          .memorial-tree-stroke {
            stroke-dashoffset: 0;
          }
          .memorial-leaf-dot {
            opacity: 1;
          }
          .memorial-dove { display: none; }
          .memorial-embers { display: none; }
        }
        @media (max-width: 640px) {
          .memorial-text-panel {
            min-height: min(70vh, 520px);
          }
          .memorial-tree-art {
            right: -126px;
            bottom: -92px;
            width: 320px;
            height: 380px;
            opacity: 0.32;
          }
        }
      `}</style>
    </div>
  );
}
