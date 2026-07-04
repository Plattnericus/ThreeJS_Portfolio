"use client";

import { useMemo } from "react";

// Procedural cross-cut tree-trunk artwork — annual rings, radial fibers, bark
// rim with notches, knots and drying cracks. Generated once from a seed so it
// never re-wobbles; pure SVG, zero runtime cost after mount. Shared by the
// main menu (large, `detailed`) and the clock face (small, plain).

export const WOOD = {
  barkDark: "#241708",
  barkMid: "#3a2712",
  woodDeep: "#4a3118",
  woodMid: "#6b4a26",
  woodLight: "#8a6335",
  ringLight: "#c9a86e",
  ringDark: "#7a5730",
  crack: "#1c1206",
  text: "#f4e8d0",
  textDim: "rgba(244, 232, 208, 0.74)",
  accent: "#e0b25c",
};

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One wobbly closed ring as an SVG path: radius modulated by a few
// low-frequency harmonics so it looks grown, not drawn.
function ringPath(
  cx: number,
  cy: number,
  r: number,
  rng: () => number,
  wobble: number,
  squash = 0.985,
): string {
  const harmonics = [
    { k: 2, a: (rng() - 0.5) * wobble, p: rng() * Math.PI * 2 },
    { k: 3, a: (rng() - 0.5) * wobble * 0.7, p: rng() * Math.PI * 2 },
    { k: 5, a: (rng() - 0.5) * wobble * 0.4, p: rng() * Math.PI * 2 },
    { k: 8, a: (rng() - 0.5) * wobble * 0.22, p: rng() * Math.PI * 2 },
    { k: 13, a: (rng() - 0.5) * wobble * 0.1, p: rng() * Math.PI * 2 },
  ];
  const N = 96;
  let d = "";
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * Math.PI * 2;
    let rr = r;
    for (const h of harmonics) rr += r * h.a * Math.sin(h.k * th + h.p);
    const x = cx + Math.cos(th) * rr;
    const y = cy + Math.sin(th) * rr * squash;
    d += (i === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
  }
  return d + "Z";
}

// Interpolate between two hex colors.
function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = (sh: number) => {
    const va = (pa >> sh) & 0xff;
    const vb = (pb >> sh) & 0xff;
    return Math.round(va + (vb - va) * t);
  };
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

type Ring = { d: string; stroke: string; width: number; opacity: number };
type Fiber = { d: string; opacity: number; width: number };
type Knot = { rings: Ring[]; cx: number; cy: number; r: number };

export function TrunkRings({
  size = 320,
  seed = 20260703,
  rings = 11,
  detailed = false,
  className,
}: {
  size?: number;
  seed?: number;
  rings?: number;
  detailed?: boolean;
  className?: string;
}) {
  const art = useMemo(() => {
    const rng = mulberry(seed);
    const c = size / 2;
    const rOuter = size * 0.485;
    const barkInner = rOuter * 0.9;

    // Annual rings: paired light "early wood" + darker, thinner "late wood",
    // spacing tightens toward the bark like a real slow-growing alpine tree.
    const out: Ring[] = [];
    for (let i = 0; i < rings; i++) {
      const t = (i + 1) / (rings + 1);
      const r = barkInner * (0.1 + 0.9 * Math.pow(t, 1.18)) * (0.985 + rng() * 0.03);
      const warm = rng();
      out.push({
        d: ringPath(c, c, r, rng, 0.03),
        stroke: mixHex(WOOD.ringDark, WOOD.ringLight, 0.55 + warm * 0.45),
        width: (0.5 + rng() * 0.9) * (size / 320),
        opacity: 0.16 + rng() * 0.2,
      });
      out.push({
        d: ringPath(c, c, r * (0.985 - rng() * 0.012), rng, 0.03),
        stroke: mixHex(WOOD.barkMid, WOOD.ringDark, warm * 0.6),
        width: (0.9 + rng() * 1.6) * (size / 320),
        opacity: 0.22 + rng() * 0.24,
      });
    }

    const bark = ringPath(c, c, (rOuter + barkInner) / 2, rng, 0.05);
    const rim = ringPath(c, c, rOuter * 0.995, rng, 0.03);
    const rimInner = ringPath(c, c, barkInner * 0.985, rng, 0.045);

    // Radial fibers: faint spokes from the heart outward (real medullary rays).
    const fibers: Fiber[] = [];
    if (detailed) {
      const count = 110;
      for (let i = 0; i < count; i++) {
        const th = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.05;
        const r0 = barkInner * (0.06 + rng() * 0.24);
        const r1 = barkInner * (0.55 + rng() * 0.42);
        const bend = (rng() - 0.5) * 0.08;
        const mx = c + Math.cos(th + bend) * ((r0 + r1) / 2);
        const my = c + Math.sin(th + bend) * ((r0 + r1) / 2) * 0.985;
        fibers.push({
          d:
            `M${(c + Math.cos(th) * r0).toFixed(1)} ${(c + Math.sin(th) * r0 * 0.985).toFixed(1)}` +
            `Q${mx.toFixed(1)} ${my.toFixed(1)} ${(c + Math.cos(th + bend * 2) * r1).toFixed(1)} ${(c + Math.sin(th + bend * 2) * r1 * 0.985).toFixed(1)}`,
          opacity: 0.025 + rng() * 0.06,
          width: (0.5 + rng() * 0.7) * (size / 320),
        });
      }
    }

    // Knots: where old branches grew — tiny off-center ring systems.
    const knots: Knot[] = [];
    if (detailed) {
      const knotCount = 2 + Math.floor(rng() * 2);
      for (let k = 0; k < knotCount; k++) {
        const th = rng() * Math.PI * 2;
        const dist = barkInner * (0.38 + rng() * 0.4);
        // Rounded so SSR + client render identical attributes (Math.sin/cos
        // results can differ in the last bit between engines).
        const kx = Number((c + Math.cos(th) * dist).toFixed(2));
        const ky = Number((c + Math.sin(th) * dist * 0.985).toFixed(2));
        const kr = Number((size * (0.02 + rng() * 0.03)).toFixed(2));
        const kRings: Ring[] = [];
        for (let i = 0; i < 5; i++) {
          const t = (i + 1) / 5;
          kRings.push({
            d: ringPath(kx, ky, kr * t, rng, 0.14, 0.75 + rng() * 0.2),
            stroke: i < 2 ? WOOD.crack : mixHex(WOOD.ringDark, WOOD.barkMid, t),
            width: (i < 2 ? 1.6 : 0.9) * (size / 320),
            opacity: i < 2 ? 0.75 : 0.4,
          });
        }
        knots.push({ rings: kRings, cx: kx, cy: ky, r: kr });
      }
    }

    // Drying cracks: radial splits with small side branches.
    const cracks: string[] = [];
    const crackCount = detailed ? 4 + Math.floor(rng() * 3) : 2 + Math.floor(rng() * 2);
    for (let i = 0; i < crackCount; i++) {
      const th = rng() * Math.PI * 2;
      const r0 = barkInner * (0.12 + rng() * 0.22);
      const r1 = barkInner * (0.6 + rng() * 0.34);
      const sway = (rng() - 0.5) * 0.32;
      const mx = c + Math.cos(th + sway * 0.5) * ((r0 + r1) / 2);
      const my = c + Math.sin(th + sway * 0.5) * ((r0 + r1) / 2);
      cracks.push(
        `M${(c + Math.cos(th) * r0).toFixed(1)} ${(c + Math.sin(th) * r0).toFixed(1)}` +
          `Q${mx.toFixed(1)} ${my.toFixed(1)} ${(c + Math.cos(th + sway) * r1).toFixed(1)} ${(c + Math.sin(th + sway) * r1).toFixed(1)}`,
      );
      if (detailed && rng() > 0.4) {
        const bt = 0.45 + rng() * 0.3;
        const bx = c + Math.cos(th + sway * bt * 0.5) * (r0 + (r1 - r0) * bt);
        const by = c + Math.sin(th + sway * bt * 0.5) * (r0 + (r1 - r0) * bt);
        const ba = th + sway + (rng() - 0.5) * 0.9;
        const bl = size * (0.03 + rng() * 0.05);
        cracks.push(
          `M${bx.toFixed(1)} ${by.toFixed(1)}L${(bx + Math.cos(ba) * bl).toFixed(1)} ${(by + Math.sin(ba) * bl).toFixed(1)}`,
        );
      }
    }

    // Bark notches: short dark radial ticks all around the rim.
    const notches: string[] = [];
    if (detailed) {
      const count = 90;
      for (let i = 0; i < count; i++) {
        const th = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.04;
        const rA = barkInner * (0.97 + rng() * 0.02);
        const rB = rOuter * (0.99 + rng() * 0.015);
        notches.push(
          `M${(c + Math.cos(th) * rA).toFixed(1)} ${(c + Math.sin(th) * rA).toFixed(1)}` +
            `L${(c + Math.cos(th) * rB).toFixed(1)} ${(c + Math.sin(th) * rB).toFixed(1)}`,
        );
      }
    }

    return { out, bark, rim, rimInner, cracks, fibers, knots, notches, c, rOuter, barkInner };
  }, [size, seed, rings, detailed]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-hidden
      style={{ display: "block" }}
    >
      <defs>
        <radialGradient id={`wood-face-${seed}`} cx="42%" cy="40%" r="75%">
          <stop offset="0" stopColor={WOOD.woodLight} />
          <stop offset="0.45" stopColor={WOOD.woodMid} />
          <stop offset="0.8" stopColor={WOOD.woodDeep} />
          <stop offset="1" stopColor={WOOD.barkMid} />
        </radialGradient>
        <radialGradient id={`wood-heart-${seed}`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={WOOD.ringDark} stopOpacity="0.5" />
          <stop offset="0.25" stopColor={WOOD.woodDeep} stopOpacity="0.25" />
          <stop offset="1" stopColor={WOOD.woodDeep} stopOpacity="0" />
        </radialGradient>
        <filter id={`wood-grain-${seed}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012 0.05"
            numOctaves="3"
            seed={seed % 997}
            result="n"
          />
          <feColorMatrix
            in="n"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.4 0.3 0 0 0"
            result="grain"
          />
          <feComposite in="grain" in2="SourceGraphic" operator="in" />
        </filter>
        <filter id={`wood-fine-${seed}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="turbulence"
            baseFrequency="0.35 0.35"
            numOctaves="2"
            seed={(seed * 7) % 997}
            result="n2"
          />
          <feColorMatrix
            in="n2"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.22 0.16 0 0 0"
            result="fine"
          />
          <feComposite in="fine" in2="SourceGraphic" operator="in" />
        </filter>
      </defs>

      {/* bark rim */}
      <path d={art.bark} fill="none" stroke={WOOD.barkDark} strokeWidth={size * 0.055} opacity={0.97} />
      <path d={art.rim} fill="none" stroke={WOOD.barkMid} strokeWidth={size * 0.02} opacity={0.9} />

      {/* wood face + heartwood shading */}
      <path d={art.bark} fill={`url(#wood-face-${seed})`} />
      <path d={art.bark} fill={`url(#wood-heart-${seed})`} />

      {/* coarse blotchy grain + fine speckle, clipped to the face */}
      <path d={art.bark} fill="#000" opacity={0.3} filter={`url(#wood-grain-${seed})`} />
      {detailed && <path d={art.bark} fill="#000" opacity={0.2} filter={`url(#wood-fine-${seed})`} />}

      {/* radial fibers under the rings */}
      {art.fibers.map((f, i) => (
        <path key={`f${i}`} d={f.d} fill="none" stroke={WOOD.crack} strokeWidth={f.width} opacity={f.opacity} />
      ))}

      {/* annual rings */}
      {art.out.map((r, i) => (
        <path key={i} d={r.d} fill="none" stroke={r.stroke} strokeWidth={r.width} opacity={r.opacity} />
      ))}

      {/* sapwood highlight just inside the bark */}
      <path d={art.rimInner} fill="none" stroke={WOOD.ringLight} strokeWidth={size * 0.006} opacity={0.28} />

      {/* knots */}
      {art.knots.map((k, i) => (
        <g key={`k${i}`}>
          <ellipse cx={k.cx} cy={k.cy} rx={k.r * 0.5} ry={k.r * 0.36} fill={WOOD.crack} opacity={0.65} />
          {k.rings.map((r, j) => (
            <path key={j} d={r.d} fill="none" stroke={r.stroke} strokeWidth={r.width} opacity={r.opacity} />
          ))}
        </g>
      ))}

      {/* drying cracks */}
      {art.cracks.map((d, i) => (
        <path
          key={`c${i}`}
          d={d}
          fill="none"
          stroke={WOOD.crack}
          strokeWidth={1.7 * (size / 320)}
          opacity={0.55}
          strokeLinecap="round"
        />
      ))}

      {/* bark notches */}
      {art.notches.map((d, i) => (
        <path
          key={`n${i}`}
          d={d}
          fill="none"
          stroke={WOOD.barkDark}
          strokeWidth={(0.8 + (i % 3) * 0.5) * (size / 320)}
          opacity={0.5}
        />
      ))}
    </svg>
  );
}
