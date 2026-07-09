"use client";

import { useI18n, type Locale } from "@/lib/i18n";
import { Keycap } from "./RotateControls";

// Game-style overlay shown in fly / walk mode: a centre crosshair + a keycap
// control legend. Pointer-events-none so canvas clicks still grab pointer-lock.

type Hints = { move: string; look: string; jump: string; exit: string; mouse: string };

// One entry per supported locale (typed `satisfies` so a missing translation
// fails the build instead of silently falling back to English).
const HINTS = {
  de: { move: "Bewegen", look: "Umsehen", jump: "Springen", exit: "Verlassen", mouse: "Maus" },
  en: { move: "Move", look: "Look", jump: "Jump", exit: "Exit", mouse: "Mouse" },
  it: { move: "Muovi", look: "Guarda", jump: "Salta", exit: "Esci", mouse: "Mouse" },
  es: { move: "Mover", look: "Mirar", jump: "Saltar", exit: "Salir", mouse: "Ratón" },
  fr: { move: "Bouger", look: "Regarder", jump: "Sauter", exit: "Quitter", mouse: "Souris" },
  pt: { move: "Mover", look: "Olhar", jump: "Pular", exit: "Sair", mouse: "Mouse" },
  nl: { move: "Bewegen", look: "Kijken", jump: "Springen", exit: "Verlaten", mouse: "Muis" },
  pl: { move: "Ruch", look: "Patrzenie", jump: "Skok", exit: "Wyjście", mouse: "Mysz" },
  ru: { move: "Движение", look: "Обзор", jump: "Прыжок", exit: "Выход", mouse: "Мышь" },
  tr: { move: "Hareket", look: "Bakış", jump: "Zıpla", exit: "Çıkış", mouse: "Fare" },
  zh: { move: "移动", look: "环顾", jump: "跳跃", exit: "退出", mouse: "鼠标" },
  ja: { move: "移動", look: "視点", jump: "ジャンプ", exit: "終了", mouse: "マウス" },
  ko: { move: "이동", look: "시점", jump: "점프", exit: "종료", mouse: "마우스" },
  hi: { move: "चलें", look: "देखें", jump: "कूदें", exit: "बाहर निकलें", mouse: "माउस" },
  ar: { move: "تحرك", look: "انظر", jump: "اقفز", exit: "خروج", mouse: "الفأرة" },
} satisfies Record<Locale, Hints>;

// Same carved-wood keycap as orbit mode's RotateControls — one UI language
// across every camera mode, not a different-looking panel per mode.
function Row({ caps, label, wide }: { caps: string[]; label: string; wide?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1">
        {caps.map((c) => (
          <Keycap key={c} glyph={c} active={false} wide={wide} />
        ))}
      </span>
      <span
        className="text-[11px] font-medium text-white/70"
        style={{ textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}
      >
        {label}
      </span>
    </div>
  );
}

export default function GameHUD({ mode }: { mode: "fly" | "walk" }) {
  const { locale } = useI18n();
  const h = HINTS[locale];

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

      {/* Control legend — bare wooden keycaps, same position/style as the
          orbit-mode RotateControls (no boxed panel there either). */}
      <div className="anim-rise absolute bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-[calc(1.25rem+env(safe-area-inset-right))] flex flex-col items-end gap-2">
        <Row caps={["W", "A", "S", "D"]} label={h.move} />
        <Row caps={[h.mouse]} label={h.look} wide />
        {mode === "walk" && <Row caps={["Space"]} label={h.jump} wide />}
        <Row caps={["Esc"]} label={h.exit} wide />
      </div>
    </div>
  );
}
