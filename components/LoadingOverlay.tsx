"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";

const MIN_VISIBLE_MS = 900;
const INSTANT_CACHE_GRACE_MS = 1800;

type LoaderStyle = CSSProperties & {
  "--load": string;
};

type Branch = { d: string; w: number; delay: number };
type Leaf = { cx: number; cy: number; r: number; c: string; d: number };

const LEAF_COLORS = ["#6fab4e", "#7fb75a", "#9fd272", "#cbe98c", "#d7a756", "#e8f6a5"];

// A recursive line-art tree generated once (seeded → deterministic). Lots of
// staggered strokes draw outward from the trunk for a rich, "growing" feel.
function buildTree(): { branches: Branch[]; leaves: Leaf[] } {
  let seed = 1337;
  const rng = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  const branches: Branch[] = [];
  const leaves: Leaf[] = [];
  const MAX_DEPTH = 5;
  const STROKE = 0.34; // seconds a single stroke takes to draw
  // Round outputs: Math.sin/cos can differ by 1 ULP between the server (Node)
  // and client (browser) engines, which otherwise causes a hydration mismatch.
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const r3 = (n: number) => Math.round(n * 1000) / 1000;

  const grow = (
    x: number,
    y: number,
    angle: number,
    len: number,
    depth: number,
    delay: number,
  ) => {
    if (branches.length > 70) return;
    const x2 = r2(x + Math.sin(angle) * len);
    const y2 = r2(y - Math.cos(angle) * len);
    // a gentle perpendicular bend so strokes look hand-drawn, not ruler-straight
    const mx = r2((x + x2) / 2 + Math.cos(angle) * (rng() - 0.5) * len * 0.5);
    const my = r2((y + y2) / 2 + Math.sin(angle) * (rng() - 0.5) * len * 0.5);
    branches.push({
      d: `M${x.toFixed(1)} ${y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`,
      w: r2(Math.max(0.8, 4 - depth * 0.72)),
      delay: r3(delay),
    });

    const done = delay + STROKE;
    if (depth >= MAX_DEPTH) {
      leaves.push({
        cx: r2(x2),
        cy: r2(y2),
        r: r2(2.8 + rng() * 2.2),
        c: LEAF_COLORS[Math.floor(rng() * LEAF_COLORS.length)],
        d: r3(done + 0.1),
      });
      return;
    }
    const kids = depth === 0 ? 2 : rng() < 0.32 ? 3 : 2;
    const spread = 0.42 + rng() * 0.22;
    for (let i = 0; i < kids; i++) {
      const f = i / (kids - 1) - 0.5; // -0.5..0.5
      const childAngle = angle + f * spread * 2 + (rng() - 0.5) * 0.18;
      grow(x2, y2, childAngle, len * (0.7 + rng() * 0.08), depth + 1, done + rng() * 0.04);
      // a few mid-branch leaves on the upper half for fullness
      if (depth >= MAX_DEPTH - 2 && rng() < 0.5) {
        leaves.push({
          cx: r2(x2),
          cy: r2(y2),
          r: r2(2.4 + rng() * 1.8),
          c: LEAF_COLORS[Math.floor(rng() * LEAF_COLORS.length)],
          d: r3(done + 0.1),
        });
      }
    }
  };

  grow(100, 202, 0, 34, 0, 0);
  return { branches, leaves };
}

const TREE = buildTree();

export default function LoadingOverlay({ sceneReady }: { sceneReady: boolean }) {
  const { progress, active } = useProgress();
  const [hidden, setHidden] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [settled, setSettled] = useState(false);
  const [cacheGraceDone, setCacheGraceDone] = useState(false);
  const [sceneGraceDone, setSceneGraceDone] = useState(false);
  const [displayProgress, setDisplayProgress] = useState(0);
  const displayRef = useRef(0);
  const sawLoad = useRef(false);
  const revealed = useRef(false);

  if (active || progress > 0) sawLoad.current = true;

  useEffect(() => {
    const settledId = window.setTimeout(() => setSettled(true), MIN_VISIBLE_MS);
    const cacheId = window.setTimeout(() => setCacheGraceDone(true), INSTANT_CACHE_GRACE_MS);
    return () => {
      window.clearTimeout(settledId);
      window.clearTimeout(cacheId);
    };
  }, []);

  useEffect(() => {
    if (!sceneReady) return;
    const id = window.setTimeout(() => setSceneGraceDone(true), 650);
    return () => window.clearTimeout(id);
  }, [sceneReady]);

  const targetProgress = useMemo(() => {
    if (sawLoad.current) return Math.max(4, progress);
    return cacheGraceDone ? 100 : 18;
  }, [cacheGraceDone, progress]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      let current = displayRef.current;
      current += (targetProgress - current) * 0.09;
      if (Math.abs(targetProgress - current) < 0.08) current = targetProgress;
      displayRef.current = current;
      setDisplayProgress(current);
      if (current !== targetProgress) raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [targetProgress]);

  const ready =
    sceneReady &&
    settled &&
    ((!active &&
      ((sawLoad.current && progress >= 99) || (!sawLoad.current && cacheGraceDone))) ||
      sceneGraceDone);

  useEffect(() => {
    if (!ready || revealed.current) return;
    revealed.current = true;
    displayRef.current = 100;
    setDisplayProgress(100);
    setExiting(true);
    const id = window.setTimeout(() => setHidden(true), 920);
    return () => window.clearTimeout(id);
  }, [ready]);

  if (hidden) return null;

  const style: LoaderStyle = {
    "--load": `${Math.min(100, displayProgress)}%`,
  };

  // Richly branched line-art tree (generated once). Many strokes draw outward
  // from the trunk via stroke-dashoffset; leaves bloom at the tips after.
  const { branches, leaves } = TREE;

  return (
    <div
      className={`loader-root fixed inset-0 z-50 grid place-items-center overflow-hidden ${
        exiting ? "loader-exit" : ""
      }`}
      style={style}
    >
      <div className="loader-glow" />

      <div className="loader-stage" aria-label="Loading Star Tree">
        <div className="loader-mark">
          <svg viewBox="0 0 200 210" className="loader-svg" aria-hidden="true">
            <defs>
              <linearGradient id="loaderBark" x1="100" y1="200" x2="100" y2="100"
                gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#8a6a3e" />
                <stop offset="0.55" stopColor="#6f9a4d" />
                <stop offset="1" stopColor="#cbe98c" />
              </linearGradient>
            </defs>

            <g className="loader-canopy">
              {branches.map((b, i) => (
                <path
                  key={i}
                  className="loader-branch"
                  d={b.d}
                  pathLength={1}
                  strokeWidth={b.w}
                  style={{ animationDelay: `${b.delay}s` }}
                />
              ))}
              {leaves.map((l, i) => (
                <circle
                  key={i}
                  className="loader-leaf"
                  cx={l.cx}
                  cy={l.cy}
                  r={l.r}
                  fill={l.c}
                  style={{ animationDelay: `${l.d}s` }}
                />
              ))}
            </g>

            <line className="loader-ground" x1="56" y1="200" x2="144" y2="200" />
          </svg>
        </div>

        <div className="loader-copy">
          <div className="loader-title">Star Tree</div>
          <div className="loader-subtitle">Growing the floating village</div>
        </div>

        <div className="loader-meter">
          <div className="loader-meter-fill" />
        </div>
        <div className="loader-percent">{Math.round(displayProgress)}%</div>
      </div>

      <style jsx>{`
        .loader-root {
          background:
            radial-gradient(100% 70% at 50% 30%, rgba(120, 159, 88, 0.08), transparent 62%),
            linear-gradient(180deg, #0b110e 0%, #090d0b 55%, #070908 100%);
          color: white;
          opacity: 1;
          transform: scale(1);
          transition: opacity 820ms cubic-bezier(0.22, 1, 0.36, 1),
            transform 820ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        .loader-exit {
          opacity: 0;
          transform: scale(1.02);
          pointer-events: none;
        }

        /* one soft, slow-breathing glow behind the tree — no grids/beams/conic */
        .loader-glow {
          position: absolute;
          top: 38%;
          left: 50%;
          width: 460px;
          height: 460px;
          max-width: 88vw;
          max-height: 88vw;
          transform: translate(-50%, -50%);
          border-radius: 999px;
          pointer-events: none;
          background: radial-gradient(
            circle,
            rgba(159, 210, 114, 0.1),
            rgba(159, 210, 114, 0.03) 42%,
            transparent 70%
          );
          animation: loader-breathe 6s ease-in-out infinite;
        }

        .loader-stage {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 22px;
          animation: loader-enter 800ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .loader-mark {
          position: relative;
          width: 196px;
          height: 206px;
          display: grid;
          place-items: center;
        }

        .loader-svg {
          width: 196px;
          height: 206px;
          overflow: visible;
          filter: drop-shadow(0 18px 38px rgba(0, 0, 0, 0.4));
        }

        /* gentle, organic idle sway pivoting from the trunk base */
        .loader-canopy {
          transform-box: fill-box;
          transform-origin: 100px 198px;
          animation: loader-sway 6s ease-in-out infinite;
        }

        .loader-branch {
          fill: none;
          stroke: url(#loaderBark);
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          animation: loader-draw 1.05s cubic-bezier(0.65, 0, 0.35, 1) forwards;
        }

        .loader-leaf {
          transform-box: fill-box;
          transform-origin: center;
          transform: scale(0);
          opacity: 0;
          animation: loader-bloom 0.62s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        .loader-ground {
          stroke: rgba(203, 233, 140, 0.5);
          stroke-width: 1.6;
          stroke-linecap: round;
          transform-box: fill-box;
          transform-origin: center;
          transform: scaleX(0);
          animation: loader-ground 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.15s forwards;
        }

        .loader-copy {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
          text-align: center;
          animation: loader-rise 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.45s both;
        }

        .loader-title {
          font-size: 21px;
          font-weight: 600;
          letter-spacing: 0.14em;
          padding-left: 0.14em;
        }

        .loader-subtitle {
          font-size: 12px;
          letter-spacing: 0.02em;
          color: rgba(255, 255, 255, 0.42);
        }

        .loader-meter {
          width: min(260px, 52vw);
          height: 2px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
          animation: loader-rise 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.55s both;
        }

        .loader-meter-fill {
          width: var(--load);
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #6f9a4d, #cbe98c, #d7a756);
          transition: width 200ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        .loader-percent {
          color: rgba(203, 233, 140, 0.85);
          font-size: 12px;
          letter-spacing: 0.06em;
          font-variant-numeric: tabular-nums;
          animation: loader-rise 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.6s both;
        }

        @keyframes loader-enter {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes loader-rise {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes loader-draw {
          to {
            stroke-dashoffset: 0;
          }
        }

        @keyframes loader-bloom {
          0% {
            opacity: 0;
            transform: scale(0);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes loader-ground {
          to {
            transform: scaleX(1);
          }
        }

        @keyframes loader-sway {
          0%, 100% {
            transform: rotate(-1deg);
          }
          50% {
            transform: rotate(1deg);
          }
        }

        @keyframes loader-breathe {
          0%, 100% {
            opacity: 0.4;
            transform: translate(-50%, -50%) scale(0.97);
          }
          50% {
            opacity: 0.75;
            transform: translate(-50%, -50%) scale(1.04);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .loader-glow,
          .loader-canopy {
            animation: none;
          }
          .loader-branch {
            stroke-dashoffset: 0;
            animation: none;
          }
          .loader-leaf {
            opacity: 1;
            transform: scale(1);
            animation: none;
          }
          .loader-ground {
            transform: scaleX(1);
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
