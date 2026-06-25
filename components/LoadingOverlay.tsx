"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";

const R = 54;
const C = 2 * Math.PI * R;
const MIN_VISIBLE_MS = 900;
const INSTANT_CACHE_GRACE_MS = 1800;

type LoaderStyle = CSSProperties & {
  "--ring-offset": string;
  "--load": string;
};

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
    "--ring-offset": `${C * (1 - Math.min(100, displayProgress) / 100)}`,
    "--load": `${Math.min(100, displayProgress)}%`,
  };

  return (
    <div
      className={`loader-root fixed inset-0 z-50 grid place-items-center overflow-hidden ${
        exiting ? "loader-exit" : ""
      }`}
      style={style}
    >
      <div className="loader-sky" />
      <div className="loader-grid" />
      <div className="loader-beam loader-beam-a" />
      <div className="loader-beam loader-beam-b" />

      <div className="loader-stage" aria-label="Loading Star Tree">
        <div className="loader-halo loader-halo-a" />
        <div className="loader-halo loader-halo-b" />

        <div className="loader-mark">
          <svg viewBox="0 0 160 160" className="loader-svg" aria-hidden="true">
            <defs>
              <linearGradient id="loaderRing" x1="28" y1="24" x2="132" y2="136">
                <stop offset="0" stopColor="#e8f6a5" />
                <stop offset="0.48" stopColor="#9fd272" />
                <stop offset="1" stopColor="#d7a756" />
              </linearGradient>
              <radialGradient id="loaderLeaf" cx="48%" cy="35%" r="65%">
                <stop offset="0" stopColor="#a7d578" />
                <stop offset="1" stopColor="#386f34" />
              </radialGradient>
            </defs>

            <circle className="loader-ring-faint" cx="80" cy="80" r="68" />
            <circle className="loader-ring-dash loader-spin-slow" cx="80" cy="80" r="64" />
            <circle className="loader-ring-dash loader-spin-rev" cx="80" cy="80" r="45" />
            <circle
              className="loader-ring-progress"
              cx="80"
              cy="80"
              r={R}
              strokeDasharray={C}
              strokeDashoffset={`var(--ring-offset)`}
              transform="rotate(-90 80 80)"
            />

            <g className="loader-orbit loader-orbit-a">
              <circle cx="80" cy="18" r="3.5" />
              <circle cx="142" cy="80" r="2.8" />
              <circle cx="80" cy="142" r="3.2" />
              <circle cx="18" cy="80" r="2.8" />
            </g>

            <g className="loader-tree">
              <path d="M77 86h6v27c0 3-1.2 4.5-3 4.5s-3-1.5-3-4.5V86Z" fill="#7a5130" />
              <ellipse cx="80" cy="66" rx="19" ry="18" fill="url(#loaderLeaf)" />
              <ellipse cx="64" cy="76" rx="14" ry="12" fill="#5f9b45" />
              <ellipse cx="96" cy="76" rx="14" ry="12" fill="#6fab4e" />
              <ellipse cx="80" cy="82" rx="13" ry="11" fill="#7fb75a" />
            </g>
          </svg>

          <div className="loader-sparks">
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.13}s` }} />
            ))}
          </div>
        </div>

        <div className="loader-copy">
          <div className="loader-title">Star Tree</div>
          <div className="loader-subtitle">Building the floating village</div>
        </div>

        <div className="loader-meter">
          <div className="loader-meter-fill" />
        </div>
        <div className="loader-percent">{Math.round(displayProgress)}%</div>
      </div>

      <style jsx>{`
        .loader-root {
          background:
            radial-gradient(circle at 50% 38%, rgba(87, 120, 61, 0.34), transparent 30%),
            radial-gradient(circle at 20% 15%, rgba(128, 156, 96, 0.18), transparent 32%),
            linear-gradient(145deg, #071014 0%, #0e1718 46%, #06090d 100%);
          color: white;
          opacity: 1;
          transform: scale(1);
          transition: opacity 780ms cubic-bezier(0.22, 1, 0.36, 1),
            transform 780ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        .loader-exit {
          opacity: 0;
          transform: scale(1.035);
          pointer-events: none;
        }

        .loader-sky,
        .loader-grid,
        .loader-beam {
          position: absolute;
          inset: -18%;
          pointer-events: none;
        }

        .loader-sky {
          background:
            radial-gradient(circle at 50% 50%, rgba(187, 223, 126, 0.14), transparent 28%),
            conic-gradient(from 120deg, transparent, rgba(176, 214, 123, 0.12), transparent, rgba(213, 167, 86, 0.08), transparent);
          animation: loader-rotate 18s linear infinite;
        }

        .loader-grid {
          opacity: 0.18;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px);
          background-size: 64px 64px;
          transform: perspective(700px) rotateX(62deg) translateY(18%);
          animation: loader-grid 3.8s linear infinite;
        }

        .loader-beam {
          mix-blend-mode: screen;
          opacity: 0.22;
          background: linear-gradient(90deg, transparent 34%, rgba(202, 232, 145, 0.22), transparent 66%);
          transform: translateX(-35%) rotate(12deg);
          animation: loader-beam 3.4s cubic-bezier(0.65, 0, 0.35, 1) infinite;
        }

        .loader-beam-b {
          animation-delay: 1.4s;
          transform: translateX(-35%) rotate(-17deg);
          opacity: 0.13;
        }

        .loader-stage {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 18px;
          animation: loader-enter 760ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .loader-halo {
          position: absolute;
          top: 8px;
          left: 50%;
          width: 240px;
          height: 240px;
          border-radius: 999px;
          transform: translateX(-50%);
          border: 1px solid rgba(222, 241, 151, 0.1);
          animation: loader-pulse 2.8s ease-in-out infinite;
        }

        .loader-halo-b {
          width: 310px;
          height: 310px;
          top: -26px;
          animation-delay: 0.5s;
          animation-duration: 4.1s;
        }

        .loader-mark {
          position: relative;
          width: 178px;
          height: 178px;
          display: grid;
          place-items: center;
        }

        .loader-svg {
          width: 178px;
          height: 178px;
          overflow: visible;
          filter: drop-shadow(0 22px 45px rgba(0, 0, 0, 0.28));
        }

        .loader-ring-faint,
        .loader-ring-dash,
        .loader-ring-progress {
          fill: none;
          transform-origin: 80px 80px;
        }

        .loader-ring-faint {
          stroke: rgba(255, 255, 255, 0.08);
          stroke-width: 1.5;
        }

        .loader-ring-dash {
          stroke: rgba(255, 255, 255, 0.16);
          stroke-width: 1.2;
          stroke-dasharray: 2 11;
        }

        .loader-ring-progress {
          stroke: url(#loaderRing);
          stroke-width: 4;
          stroke-linecap: round;
          transition: stroke-dashoffset 220ms linear;
        }

        .loader-spin-slow {
          animation: loader-rotate 8s linear infinite;
        }

        .loader-spin-rev {
          animation: loader-rotate-rev 5.8s linear infinite;
        }

        .loader-orbit {
          fill: #cfe982;
          opacity: 0.9;
          transform-origin: 80px 80px;
          animation: loader-rotate 4.6s linear infinite;
        }

        .loader-tree {
          transform-origin: 80px 96px;
          animation: loader-tree 1.8s ease-in-out infinite;
        }

        .loader-sparks {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .loader-sparks span {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 4px;
          height: 4px;
          border-radius: 999px;
          background: #d9ef94;
          opacity: 0;
          transform: rotate(calc(var(--i, 1) * 1deg));
          animation: loader-spark 1.8s ease-out infinite;
        }

        .loader-sparks span:nth-child(1) { --a: 0deg; }
        .loader-sparks span:nth-child(2) { --a: 30deg; }
        .loader-sparks span:nth-child(3) { --a: 60deg; }
        .loader-sparks span:nth-child(4) { --a: 90deg; }
        .loader-sparks span:nth-child(5) { --a: 120deg; }
        .loader-sparks span:nth-child(6) { --a: 150deg; }
        .loader-sparks span:nth-child(7) { --a: 180deg; }
        .loader-sparks span:nth-child(8) { --a: 210deg; }
        .loader-sparks span:nth-child(9) { --a: 240deg; }
        .loader-sparks span:nth-child(10) { --a: 270deg; }
        .loader-sparks span:nth-child(11) { --a: 300deg; }
        .loader-sparks span:nth-child(12) { --a: 330deg; }

        .loader-copy {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          text-align: center;
        }

        .loader-title {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: 0;
        }

        .loader-subtitle {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.48);
        }

        .loader-meter {
          width: min(300px, 56vw);
          height: 2px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
        }

        .loader-meter-fill {
          width: var(--load);
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #789f58, #d9ef94, #d3a45a);
          transition: width 160ms linear;
        }

        .loader-percent {
          color: #cfe982;
          font-size: 13px;
          font-variant-numeric: tabular-nums;
        }

        @keyframes loader-enter {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes loader-rotate {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes loader-rotate-rev {
          to {
            transform: rotate(-360deg);
          }
        }

        @keyframes loader-grid {
          to {
            background-position: 0 64px, 64px 0;
          }
        }

        @keyframes loader-beam {
          0%, 18% {
            opacity: 0;
            translate: -45% 0;
          }
          42% {
            opacity: 0.28;
          }
          100% {
            opacity: 0;
            translate: 70% 0;
          }
        }

        @keyframes loader-pulse {
          0%, 100% {
            opacity: 0.25;
            scale: 0.92;
          }
          50% {
            opacity: 0.7;
            scale: 1.06;
          }
        }

        @keyframes loader-tree {
          0%, 100% {
            transform: scale(1) translateY(0);
          }
          50% {
            transform: scale(1.04) translateY(-1px);
          }
        }

        @keyframes loader-spark {
          0% {
            opacity: 0;
            transform: rotate(var(--a)) translateX(34px) scale(0.4);
          }
          35% {
            opacity: 0.85;
          }
          100% {
            opacity: 0;
            transform: rotate(var(--a)) translateX(86px) scale(1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .loader-sky,
          .loader-grid,
          .loader-beam,
          .loader-halo,
          .loader-ring-dash,
          .loader-orbit,
          .loader-tree,
          .loader-sparks span,
          .loader-stage {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
