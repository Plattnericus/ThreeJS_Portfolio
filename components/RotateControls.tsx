"use client";

import { useEffect, useState } from "react";
import { cameraBus } from "@/lib/cameraBus";
import { useCoarsePointer } from "@/lib/useCoarsePointer";
import { WOOD } from "./TrunkRings";

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

type KeyId = "up" | "down" | "left" | "right" | "shift";

// Game-style keycap: carved wooden key with an engraved glyph. Lights up while
// held (pointer OR the real keyboard key) and physically presses down.
function Keycap({
  glyph,
  active,
  wide = false,
  onHold,
}: {
  glyph: string;
  active: boolean;
  wide?: boolean;
  onHold?: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onPointerLeave: () => void;
  };
}) {
  return (
    <button
      aria-label={glyph}
      {...onHold}
      className={`keycap relative select-none rounded-[9px] text-[13px] font-bold ${
        wide ? "h-9 px-3" : "h-9 w-9"
      }`}
      data-active={active || undefined}
      style={{
        color: active ? "#ffe9b8" : WOOD.text,
        background: active
          ? `linear-gradient(180deg, ${WOOD.woodLight}, ${WOOD.woodMid})`
          : `linear-gradient(180deg, ${WOOD.woodMid}, ${WOOD.woodDeep} 70%, ${WOOD.barkMid})`,
        border: `1px solid ${WOOD.barkDark}`,
        boxShadow: active
          ? `inset 0 1px 0 rgba(255,232,190,0.35), inset 0 -1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.5), 0 0 14px rgba(217,168,81,0.35)`
          : `inset 0 1px 0 rgba(255,232,190,0.22), inset 0 -2px 3px rgba(0,0,0,0.45), 0 3px 0 ${WOOD.barkDark}, 0 5px 8px rgba(0,0,0,0.5)`,
        transform: active ? "translateY(2px)" : "translateY(0)",
        transition: "transform 80ms ease, box-shadow 80ms ease, background 120ms ease",
        textShadow: "0 -1px 0 rgba(0,0,0,0.6), 0 1px 1px rgba(255,232,190,0.14)",
      }}
    >
      {glyph}
    </button>
  );
}

/**
 * Bottom-right control legend — reads like a film/game HUD: real keycaps for
 * ← → ↑ ↓ (hold to orbit/tilt), Shift (faster) and Esc (menu). The caps are
 * also buttons: holding one drives the camera exactly like the key.
 */
export default function RotateControls({ fly }: { fly: boolean }) {
  const coarse = useCoarsePointer();
  const [held, setHeld] = useState<Record<KeyId, boolean>>({
    up: false,
    down: false,
    left: false,
    right: false,
    shift: false,
  });

  const mark = (key: KeyId, on: boolean) =>
    setHeld((h) => (h[key] === on ? h : { ...h, [key]: on }));

  useEffect(() => {
    if (fly) {
      cameraBus.rotate = 0;
      cameraBus.tilt = 0;
      cameraBus.fast = false;
      return;
    }
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        cameraBus.fast = true;
        mark("shift", true);
      }
      if (isTextInputTarget(e.target)) return;
      if (e.key === "ArrowLeft") {
        cameraBus.rotate = 1;
        mark("left", true);
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        cameraBus.rotate = -1;
        mark("right", true);
        e.preventDefault();
      } else if (e.key === "ArrowUp") {
        cameraBus.tilt = 1;
        mark("up", true);
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        cameraBus.tilt = -1;
        mark("down", true);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        cameraBus.fast = false;
        mark("shift", false);
      }
      if (e.key === "ArrowLeft") {
        if (cameraBus.rotate === 1) cameraBus.rotate = 0;
        mark("left", false);
      }
      if (e.key === "ArrowRight") {
        if (cameraBus.rotate === -1) cameraBus.rotate = 0;
        mark("right", false);
      }
      if (e.key === "ArrowUp") {
        if (cameraBus.tilt === 1) cameraBus.tilt = 0;
        mark("up", false);
      }
      if (e.key === "ArrowDown") {
        if (cameraBus.tilt === -1) cameraBus.tilt = 0;
        mark("down", false);
      }
    };
    const blur = () => {
      cameraBus.rotate = 0;
      cameraBus.tilt = 0;
      cameraBus.fast = false;
      setHeld({ up: false, down: false, left: false, right: false, shift: false });
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      blur();
    };
  }, [fly]);

  // Touch devices orbit/pinch/pan natively through OrbitControls, so the
  // keycap legend (arrow keys / Shift / Esc) is desktop-only noise there.
  if (fly || coarse) return null;

  const hold = (axis: "rotate" | "tilt", dir: -1 | 1, key: KeyId) => ({
    onPointerDown: (e: React.PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      cameraBus[axis] = dir;
      mark(key, true);
    },
    onPointerUp: () => {
      cameraBus[axis] = 0;
      mark(key, false);
    },
    onPointerCancel: () => {
      cameraBus[axis] = 0;
      mark(key, false);
    },
    onPointerLeave: () => {
      if (cameraBus[axis] === dir) cameraBus[axis] = 0;
      mark(key, false);
    },
  });

  // Bare keycaps only — no plaque, no labels.
  return (
    <div className="anim-rise absolute bottom-5 right-5 z-20 flex items-end gap-2.5">
      <div className="flex flex-col items-center gap-1">
        <Keycap glyph="↑" active={held.up} onHold={hold("tilt", 1, "up")} />
        <div className="flex gap-1">
          <Keycap glyph="←" active={held.left} onHold={hold("rotate", 1, "left")} />
          <Keycap glyph="↓" active={held.down} onHold={hold("tilt", -1, "down")} />
          <Keycap glyph="→" active={held.right} onHold={hold("rotate", -1, "right")} />
        </div>
      </div>
      <div className="flex flex-col items-stretch gap-1">
        <Keycap glyph="⇧ Shift" wide active={held.shift} />
        <Keycap glyph="Esc" wide active={false} />
      </div>
    </div>
  );
}
