"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { TrunkRings, WOOD } from "./TrunkRings";

// A wildly over-the-top, hand-crafted 404 — on-brand with the living star-tree:
// the "0" is a real cut tree-ring slice, the "4"s are carved wooden slabs, a
// leaf-storm blows across on the wind, fireflies drift, a lone villager ant walks
// the baseline, and the whole diorama tilts + parallaxes toward the cursor.
// Pure DOM/SVG + GSAP (no WebGL) so an error route still loads instantly.

// useLayoutEffect on the client, useEffect on the server (no SSR warning).
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type Lang = "de" | "en" | "it";

const COPY: Record<Lang, { tag: string; title: string; sub: string; back: string }> = {
  de: {
    tag: "Fehler 404",
    title: "Dieser Ast existiert nicht.",
    sub: "Du hast dich im Blätterdach verirrt — diese Seite ist vom Baum gefallen.",
    back: "Zurück zum Baum",
  },
  en: {
    tag: "Error 404",
    title: "This branch doesn’t exist.",
    sub: "You’ve wandered off into the canopy — this page fell from the tree.",
    back: "Back to the tree",
  },
  it: {
    tag: "Errore 404",
    title: "Questo ramo non esiste.",
    sub: "Ti sei perso tra le foglie — questa pagina è caduta dall’albero.",
    back: "Torna all’albero",
  },
};

// Foliage greens with a few warm autumn accents — matches the scene palette.
const LEAF_COLORS = [
  "#9fd272", "#7cbf55", "#6fae3f", "#5c9a34", "#4e8a3a",
  "#b7d98a", "#e0b25c", "#c9702f", "#b5532a",
];

const LEAF_COUNT = 34;
const FIREFLY_COUNT = 15;

// A single folded leaf with a midrib, tintable per instance.
function LeafSVG({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden style={{ display: "block" }}>
      <path
        d="M12 1.5C5.5 6 5 14 12 22.5C19 14 18.5 6 12 1.5Z"
        fill={color}
      />
      <path
        d="M12 3.4C7.8 7.2 7.6 13.6 12 20.6C16.4 13.6 16.2 7.2 12 3.4Z"
        fill="#000"
        opacity="0.12"
      />
      <path d="M12 3.2V21" stroke="#1c2b12" strokeWidth="0.7" opacity="0.5" />
      <path d="M12 8.5L9 6.4M12 12L8.6 9.6M12 15.4L9.4 13.4" stroke="#1c2b12" strokeWidth="0.5" opacity="0.35" />
      <path d="M12 8.5L15 6.4M12 12L15.4 9.6M12 15.4L14.6 13.4" stroke="#1c2b12" strokeWidth="0.5" opacity="0.35" />
    </svg>
  );
}

// A tiny side-view ant — the village's mascot, wandering the baseline.
function AntSVG() {
  return (
    <svg viewBox="0 0 40 22" width="40" height="22" aria-hidden style={{ display: "block", overflow: "visible" }}>
      <g stroke={WOOD.barkDark} strokeWidth="1.4" strokeLinecap="round">
        {/* legs */}
        <path d="M20 12 L13 20 M20 12 L20 21 M20 12 L27 20" />
        <path d="M20 11 L12 15 M20 11 L28 15" />
        {/* antennae */}
        <path d="M31 9 L37 4 M31 9 L36 8" fill="none" />
      </g>
      <g fill={WOOD.barkDark}>
        <ellipse cx="11" cy="11" rx="6" ry="5" />
        <ellipse cx="21" cy="11" rx="4" ry="3.4" />
        <circle cx="31" cy="10" r="4.6" />
        <circle cx="34.2" cy="8.6" r="0.9" fill={WOOD.ringLight} />
      </g>
    </svg>
  );
}

// One carved wooden slab glyph (the "4"s): a bold numeral filled with a wood
// gradient, speckled with real feTurbulence grain, rimmed with a carved edge.
function WoodGlyph({ uid }: { uid: number }) {
  const wood = `nf-wood-${uid}`;
  const grain = `nf-grain-${uid}`;
  const fine = `nf-fine-${uid}`;
  // The "4" as a font-independent path (thick stem + crossbar + diagonal, with a
  // triangular counter via even-odd) so it renders identically everywhere and
  // never blanks while a webfont is still loading.
  const d = "M72 16 L100 16 L100 150 L72 150 L72 120 L16 120 L16 92 Z M72 30 L72 94 L40 94 Z";
  return (
    <svg
      viewBox="0 0 120 160"
      className="h-full w-auto"
      aria-hidden
      style={{ display: "block", overflow: "visible", filter: "drop-shadow(0 22px 26px rgba(0,0,0,0.55))" }}
    >
      <defs>
        <radialGradient id={wood} cx="40%" cy="32%" r="82%">
          <stop offset="0" stopColor={WOOD.woodLight} />
          <stop offset="0.5" stopColor={WOOD.woodMid} />
          <stop offset="0.82" stopColor={WOOD.woodDeep} />
          <stop offset="1" stopColor={WOOD.barkMid} />
        </radialGradient>
        <filter id={grain} x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency="0.011 0.055" numOctaves="3" seed={uid * 13} result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.55 0.42 0 0 0" result="g" />
          <feComposite in="g" in2="SourceGraphic" operator="in" />
        </filter>
        <filter id={fine} x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence type="turbulence" baseFrequency="0.32 0.32" numOctaves="2" seed={uid * 29} result="n2" />
          <feColorMatrix in="n2" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.22 0.16 0 0 0" result="f" />
          <feComposite in="f" in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
      <path d={d} fillRule="evenodd" fill={`url(#${wood})`} />
      <path d={d} fillRule="evenodd" fill="#000" opacity="0.32" filter={`url(#${grain})`} />
      <path d={d} fillRule="evenodd" fill="#000" opacity="0.18" filter={`url(#${fine})`} />
      {/* carved dark rim + a light top-left bevel */}
      <path d={d} fillRule="evenodd" fill="none" stroke={WOOD.barkDark} strokeWidth={3} opacity="0.85" strokeLinejoin="round" />
      <path d={d} fillRule="evenodd" fill="none" stroke={WOOD.ringLight} strokeWidth={1.1} opacity="0.28" strokeLinejoin="round" transform="translate(-1.4 -1.4)" />
    </svg>
  );
}

export default function NotFound() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [lang, setLang] = useState<Lang>("en");

  // Resolve language client-side (saved locale → browser → en) after hydration
  // so server and first client render match.
  useEffect(() => {
    let next: Lang = "en";
    try {
      const saved = window.localStorage.getItem("star-tree-locale");
      const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
      const pick = (saved || nav) as string;
      if (pick === "de" || pick === "it") next = pick;
      else if (nav === "de" || nav === "it") next = nav;
    } catch {
      /* ignore */
    }
    setLang(next);
  }, []);

  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const ctx = gsap.context(() => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const q = (sel: string) => gsap.utils.toArray<HTMLElement>(sel, root);
      const one = (sel: string) => root.querySelector<HTMLElement>(sel);

      const ring = one(".nf-ring");
      const digits = q(".nf-digit");
      const words = q(".nf-word");

      if (reduce) {
        // Still elegant, just still. No storm, no parallax. Everything else is
        // visible by default — no clearProps here (it would strip the row's
        // inline height and collapse the digits).
        gsap.set(".nf-leaf, .nf-firefly, .nf-ant", { opacity: 0 });
        gsap.set(".nf-rest-leaf", { opacity: 0.85 });
        return;
      }

      // ---- Intro: the diorama "grows" in, echoing the tree ------------------
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from(".nf-groundline", { scaleX: 0, opacity: 0, duration: 0.7, ease: "power2.inOut" })
        .from(".nf-tag", { y: -18, opacity: 0, duration: 0.5 }, "-=0.3")
        .from(
          digits,
          { yPercent: 130, opacity: 0, rotateZ: (i) => (i === 1 ? 0 : i === 0 ? -14 : 14), duration: 1.05, stagger: 0.14, ease: "back.out(1.7)" },
          "-=0.15",
        )
        .from(ring, { scale: 0, rotation: -160, duration: 1.1, ease: "elastic.out(1, 0.62)" }, "<0.05")
        .from(words, { yPercent: 130, opacity: 0, rotateZ: 6, duration: 0.6, stagger: 0.05 }, "-=0.7")
        .from(".nf-sub", { y: 16, opacity: 0, duration: 0.5 }, "-=0.35")
        .from(".nf-btn", { scale: 0.5, opacity: 0, duration: 0.6, ease: "back.out(2.2)" }, "-=0.25")
        .from(".nf-rest-leaf", { opacity: 0, scale: 0, stagger: 0.06, duration: 0.5 }, "-=0.4");

      // The ring slice keeps turning like a slow log on a lathe.
      if (ring) gsap.to(ring, { rotation: "+=360", duration: 54, ease: "none", repeat: -1 });

      // ---- Leaf storm on the wind ------------------------------------------
      const vw = () => window.innerWidth;
      const vh = () => window.innerHeight;
      q(".nf-leaf").forEach((leaf) => {
        const spin = Math.random() > 0.5 ? 1 : -1;
        const drift = () => {
          gsap.set(leaf, {
            x: gsap.utils.random(-0.12 * vw(), 0.2 * vw()),
            y: gsap.utils.random(-120, -40),
            rotation: gsap.utils.random(0, 360),
            scale: gsap.utils.random(0.45, 1.25),
            opacity: 0,
          });
          const dur = gsap.utils.random(7, 15);
          gsap.to(leaf, {
            x: `+=${vw() * gsap.utils.random(0.75, 1.2)}`,
            y: vh() + 120,
            rotation: `+=${spin * gsap.utils.random(220, 620)}`,
            duration: dur,
            ease: "none",
            onComplete: drift,
          });
          // flutter: a little cross-wind sway
          gsap.to(leaf, {
            x: `+=${gsap.utils.random(-40, 40)}`,
            duration: gsap.utils.random(1.4, 2.6),
            ease: "sine.inOut",
            repeat: Math.ceil(dur / 2),
            yoyo: true,
          });
          gsap.to(leaf, { opacity: 1, duration: 1.2, ease: "power1.out" });
          gsap.to(leaf, { opacity: 0, duration: 1.8, delay: dur - 1.8, ease: "power1.in" });
        };
        gsap.delayedCall(gsap.utils.random(0, 9), drift);
      });

      // ---- Fireflies --------------------------------------------------------
      q(".nf-firefly").forEach((fly) => {
        gsap.set(fly, {
          x: gsap.utils.random(0.05, 0.95) * vw(),
          y: gsap.utils.random(0.28, 0.96) * vh(),
        });
        gsap.to(fly, {
          opacity: gsap.utils.random(0.35, 0.95),
          duration: gsap.utils.random(0.9, 2.4),
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          delay: gsap.utils.random(0, 3),
        });
        gsap.to(fly, {
          x: `+=${gsap.utils.random(-70, 70)}`,
          y: `+=${gsap.utils.random(-55, 55)}`,
          duration: gsap.utils.random(4, 9),
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });
      });

      // ---- The wandering ant ------------------------------------------------
      const ant = one(".nf-ant");
      if (ant) {
        gsap.set(ant, { opacity: 1, x: -60, y: 0 });
        gsap.to(ant, { x: () => vw() + 60, duration: 19, ease: "none", repeat: -1 });
        gsap.to(ant, { y: -3, duration: 0.16, repeat: -1, yoyo: true, ease: "power1.inOut" });
      }

      // ---- Cursor: parallax depth + carved-slab tilt + magnetic button -----
      const fogX = gsap.quickTo(".nf-fog", "x", { duration: 1.1, ease: "power2" });
      const fogY = gsap.quickTo(".nf-fog", "y", { duration: 1.1, ease: "power2" });
      const dRX = gsap.quickTo(".nf-diorama", "rotationX", { duration: 0.7, ease: "power2" });
      const dRY = gsap.quickTo(".nf-diorama", "rotationY", { duration: 0.7, ease: "power2" });
      const dX = gsap.quickTo(".nf-diorama", "x", { duration: 0.9, ease: "power2" });
      const dY = gsap.quickTo(".nf-diorama", "y", { duration: 0.9, ease: "power2" });
      const frontX = gsap.quickTo(".nf-front", "x", { duration: 0.9, ease: "power2" });
      const frontY = gsap.quickTo(".nf-front", "y", { duration: 0.9, ease: "power2" });
      const btnX = gsap.quickTo(".nf-btn", "x", { duration: 0.4, ease: "power3" });
      const btnY = gsap.quickTo(".nf-btn", "y", { duration: 0.4, ease: "power3" });
      const sheenX = gsap.quickTo(".nf-sheen", "xPercent", { duration: 0.8, ease: "power2" });

      const btn = one(".nf-btn");
      const onMove = (e: PointerEvent) => {
        const mx = e.clientX / vw() - 0.5;
        const my = e.clientY / vh() - 0.5;
        fogX(mx * 22);
        fogY(my * 22);
        dRY(mx * 11);
        dRX(-my * 8);
        dX(mx * 16);
        dY(my * 12);
        frontX(mx * 40);
        frontY(my * 34);
        sheenX(mx * 90);
        if (btn) {
          const r = btn.getBoundingClientRect();
          const bx = e.clientX - (r.left + r.width / 2);
          const by = e.clientY - (r.top + r.height / 2);
          const near = Math.hypot(bx, by) < 190;
          btnX(near ? bx * 0.32 : 0);
          btnY(near ? by * 0.32 : 0);
        }
      };
      window.addEventListener("pointermove", onMove, { passive: true });

      // Hover a slab → it creaks; a small leaf puff bursts out.
      const puffLeaves = q(".nf-leaf").slice(0, 6);
      digits.forEach((d) => {
        d.addEventListener("pointerenter", () => {
          gsap.fromTo(
            d,
            { rotationZ: -3 },
            { rotationZ: 0, duration: 0.9, ease: "elastic.out(1, 0.35)" },
          );
        });
      });

      // Click anywhere → a gust sweeps the storm + the diorama jolts.
      const onClick = () => {
        gsap.fromTo(".nf-diorama", { scale: 1.02 }, { scale: 1, duration: 0.7, ease: "elastic.out(1, 0.4)" });
        puffLeaves.forEach((leaf) => {
          gsap.to(leaf, { x: `+=${gsap.utils.random(80, 260)}`, rotation: "+=180", duration: 0.9, ease: "power2.out" });
        });
      };
      root.addEventListener("click", onClick);

      return () => {
        window.removeEventListener("pointermove", onMove);
        root.removeEventListener("click", onClick);
      };
    }, rootRef);

    return () => ctx.revert();
  }, []);

  const c = COPY[lang];

  return (
    <main
      ref={rootRef}
      className="fixed inset-0 overflow-hidden text-center"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 8%, #16243a 0%, #0d1626 42%, #0a1018 74%, #070b10 100%)",
        color: WOOD.text,
      }}
    >
      {/* aurora / drifting fog */}
      <div
        className="nf-fog pointer-events-none absolute -inset-[15%] z-0"
        style={{
          background:
            "radial-gradient(38% 32% at 26% 30%, rgba(95,174,106,0.16), transparent 70%), radial-gradient(44% 36% at 78% 24%, rgba(74,143,224,0.14), transparent 72%), radial-gradient(50% 40% at 50% 88%, rgba(224,176,92,0.12), transparent 70%)",
          filter: "blur(28px)",
        }}
      />

      {/* fireflies (behind the diorama) */}
      <div className="pointer-events-none absolute inset-0 z-[1]">
        {Array.from({ length: FIREFLY_COUNT }).map((_, i) => (
          <span
            key={i}
            className="nf-firefly absolute left-0 top-0 h-1.5 w-1.5 rounded-full opacity-0"
            style={{
              background: "radial-gradient(circle, rgba(255,232,168,0.95), rgba(255,196,92,0.35) 55%, transparent 72%)",
              boxShadow: "0 0 10px 3px rgba(255,206,110,0.45)",
            }}
          />
        ))}
      </div>

      {/* the diorama: tag + 404 + copy (parallax + tilt group) */}
      <div className="absolute inset-0 z-[3] grid place-items-center px-6" style={{ perspective: 1100 }}>
        <div className="nf-diorama flex flex-col items-center" style={{ transformStyle: "preserve-3d" }}>
          <span
            className="nf-tag mb-5 rounded-full border px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.34em]"
            style={{ borderColor: "rgba(224,178,92,0.35)", color: WOOD.accent, background: "rgba(224,178,92,0.06)" }}
          >
            {c.tag}
          </span>

          {/* 404 — carved 4s + a real tree-ring slice as the 0 */}
          <div className="nf-digitrow relative flex items-center justify-center" style={{ height: "clamp(150px, 30vw, 300px)" }}>
            {/* warm ground glow under the digits */}
            <div
              className="pointer-events-none absolute left-1/2 top-[64%] -z-10 h-[42%] w-[120%] -translate-x-1/2 rounded-[50%]"
              style={{ background: "radial-gradient(closest-side, rgba(224,176,92,0.28), transparent)", filter: "blur(14px)" }}
            />
            <div className="nf-digit" style={{ height: "clamp(150px, 30vw, 300px)", transformOrigin: "50% 90%" }}>
              <WoodGlyph uid={1} />
            </div>
            <div
              className="nf-digit relative"
              style={{ height: "clamp(150px, 30vw, 300px)", width: "clamp(150px, 30vw, 300px)", marginInline: "-1.5%", transformOrigin: "50% 50%" }}
            >
              {/* soft rim shadow so the slice reads as a solid disc */}
              <div className="nf-ring absolute inset-0" style={{ filter: "drop-shadow(0 22px 26px rgba(0,0,0,0.55))" }}>
                <TrunkRings size={360} rings={13} detailed className="h-full w-full" />
              </div>
            </div>
            <div className="nf-digit" style={{ height: "clamp(150px, 30vw, 300px)", transformOrigin: "50% 90%" }}>
              <WoodGlyph uid={2} />
            </div>

            {/* moving sheen across the wood */}
            <div
              className="nf-sheen pointer-events-none absolute inset-0"
              style={{ background: "linear-gradient(105deg, transparent 38%, rgba(255,244,220,0.14) 50%, transparent 62%)", mixBlendMode: "screen" }}
            />
          </div>

          {/* carved baseline the ant walks on */}
          <div
            className="nf-groundline mt-3 h-[3px] w-[min(78vw,560px)] rounded-full"
            style={{ background: `linear-gradient(90deg, transparent, ${WOOD.woodMid}, ${WOOD.ringLight}, ${WOOD.woodMid}, transparent)`, transformOrigin: "50% 50%" }}
          />

          <h1 aria-label={c.title} className="mt-8 max-w-[22ch] text-balance text-[clamp(1.35rem,3.6vw,2.4rem)] font-black leading-tight tracking-tight">
            {c.title.split(" ").map((w, i) => (
              <span key={i} className="nf-word mr-[0.28em] inline-block">
                {w}
              </span>
            ))}
          </h1>
          <p className="nf-sub mt-3 max-w-[46ch] text-[clamp(0.92rem,1.7vw,1.08rem)] leading-relaxed" style={{ color: WOOD.textDim }}>
            {c.sub}
          </p>

          <Link
            href="/"
            className="nf-btn group relative mt-9 inline-flex items-center gap-2.5 overflow-hidden rounded-full border px-7 py-3 text-sm font-bold outline-none transition-[transform,box-shadow] focus-visible:ring-2 focus-visible:ring-[#e0b25c]"
            style={{
              borderColor: WOOD.barkDark,
              color: WOOD.text,
              background: `linear-gradient(155deg, ${WOOD.woodLight}, ${WOOD.woodMid} 46%, ${WOOD.woodDeep})`,
              boxShadow: "0 12px 26px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,240,210,0.25)",
            }}
          >
            <span
              aria-hidden
              className="grid h-5 w-5 place-items-center rounded-full text-[13px] transition-transform duration-500 group-hover:-translate-x-0.5"
              style={{ color: WOOD.accent }}
            >
              {/* home / tree glyph */}
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 11l9-8 9 8" />
                <path d="M5 10v10h14V10" />
                <path d="M10 20v-6h4v6" />
              </svg>
            </span>
            {c.back}
            <span className="nf-btn-sheen pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          </Link>
        </div>
      </div>

      {/* foreground parallax layer: the ant + resting leaves */}
      <div className="nf-front pointer-events-none absolute inset-0 z-[5]">
        <div className="nf-ant absolute left-0 opacity-0" style={{ top: "58%" }}>
          <AntSVG />
        </div>
        {/* a few leaves resting in the corner, part of the composition */}
        {Array.from({ length: 7 }).map((_, i) => (
          <span
            key={i}
            className="nf-rest-leaf absolute h-6 w-6"
            style={{
              bottom: `${seededPct(i, 2, 7)}%`,
              left: `${8 + i * 5.5}%`,
              transform: `rotate(${i * 47}deg)`,
              opacity: 0.85,
            }}
          >
            <LeafSVG color={LEAF_COLORS[i % LEAF_COLORS.length]} />
          </span>
        ))}
      </div>

      {/* the flying leaf-storm (topmost, above everything) */}
      <div className="pointer-events-none absolute inset-0 z-[6]">
        {Array.from({ length: LEAF_COUNT }).map((_, i) => (
          <span
            key={i}
            className="nf-leaf absolute left-0 top-0 opacity-0"
            style={{ height: `${14 + (i % 5) * 4}px`, width: `${14 + (i % 5) * 4}px` }}
          >
            <LeafSVG color={LEAF_COLORS[i % LEAF_COLORS.length]} />
          </span>
        ))}
      </div>

      {/* vignette */}
      <div
        className="pointer-events-none absolute inset-0 z-[7]"
        style={{ background: "radial-gradient(ellipse at center, transparent 54%, rgba(3,6,10,0.62) 100%)" }}
      />

      <span className="sr-only">404 — page not found</span>
    </main>
  );
}

// Deterministic small offset so resting-leaf positions don't use Math.random at
// render time (would break SSR hydration).
function seededPct(i: number, min: number, max: number): number {
  const t = (Math.sin(i * 12.9898) * 43758.5453) % 1;
  return +(min + Math.abs(t) * (max - min)).toFixed(2);
}
