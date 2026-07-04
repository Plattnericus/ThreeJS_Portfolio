"use client";

import { useEffect, useState } from "react";

// True on touch-first devices (phones/tablets): drives HUD decisions where a
// desktop-only control (keycap orbit legend, pointer-lock fly mode) makes no
// sense. SSR-safe — starts false, resolves on mount, and tracks changes (e.g.
// a 2-in-1 switching modes).
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return coarse;
}
