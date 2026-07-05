"use client";

import { useI18n, type Locale } from "@/lib/i18n";

// Game-style overlay shown in fly / walk mode: a centre crosshair + a keycap
// control legend. Pointer-events-none so canvas clicks still grab pointer-lock.

const HINTS: Partial<Record<Locale, { move: string; look: string; jump: string; exit: string }>> = {
  de: { move: "Bewegen", look: "Umsehen", jump: "Springen", exit: "Verlassen" },
  en: { move: "Move", look: "Look", jump: "Jump", exit: "Exit" },
  it: { move: "Muovi", look: "Guarda", jump: "Salta", exit: "Esci" },
  es: { move: "Mover", look: "Mirar", jump: "Saltar", exit: "Salir" },
  fr: { move: "Bouger", look: "Regarder", jump: "Sauter", exit: "Quitter" },
};

function Cap({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <kbd
      className={`grid ${wide ? "px-2" : "w-6"} h-6 place-items-center rounded-md border border-white/15 bg-white/[0.08] text-[10px] font-bold text-white/85 shadow-sm`}
    >
      {children}
    </kbd>
  );
}

function Row({ caps, label, wide }: { caps: string[]; label: string; wide?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1">
        {caps.map((c) => (
          <Cap key={c} wide={wide}>
            {c}
          </Cap>
        ))}
      </span>
      <span className="text-[11px] font-medium text-white/55">{label}</span>
    </div>
  );
}

export default function GameHUD({ mode }: { mode: "fly" | "walk" }) {
  const { locale } = useI18n();
  const h = HINTS[locale] ?? HINTS.en!;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* Crosshair */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative grid h-6 w-6 place-items-center">
          <span className="absolute h-[2px] w-6 rounded-full bg-white/30" />
          <span className="absolute h-6 w-[2px] rounded-full bg-white/30" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/80 shadow-[0_0_6px_rgba(255,255,255,0.6)]" />
        </div>
      </div>

      {/* Control legend */}
      <div className="anim-rise-x absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-[calc(1.25rem+env(safe-area-inset-right))] flex flex-col gap-2 rounded-2xl border border-white/10 bg-[#0b100d]/70 px-4 py-3 backdrop-blur-sm">
        <Row caps={["W", "A", "S", "D"]} label={h.move} />
        <Row caps={["Maus"]} label={h.look} wide />
        {mode === "walk" && <Row caps={["Space"]} label={h.jump} wide />}
        <Row caps={["Esc"]} label={h.exit} wide />
      </div>
    </div>
  );
}
