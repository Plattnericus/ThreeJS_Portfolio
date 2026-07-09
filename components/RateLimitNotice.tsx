"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { CloseIcon } from "./Icons";
import { WOOD } from "./TrunkRings";

// Small dismissible HUD notice — shown when a stargazer refresh actually hit
// GitHub's rate limit (never for a plain "no data yet" first load). Dismiss
// is sticky across the 5-min poll cycle: it only reappears once `active`
// transitions false→true again, i.e. the underlying state really changed.
export default function RateLimitNotice({ active }: { active: boolean }) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(false);
  const wasActive = useRef(active);

  useEffect(() => {
    if (active && !wasActive.current) setDismissed(false);
    wasActive.current = active;
  }, [active]);

  if (!active || dismissed) return null;

  return (
    <button
      type="button"
      onClick={() => setDismissed(true)}
      aria-label={t("a11y.close")}
      className="anim-rise-x absolute left-[calc(1.25rem+env(safe-area-inset-left))] top-[calc(1.25rem+env(safe-area-inset-top))] z-30 flex max-w-[min(300px,calc(100vw-2rem))] items-start gap-2 rounded-xl border px-3 py-2 text-left shadow-lg backdrop-blur-sm transition hover:brightness-110 active:scale-[0.98]"
      style={{
        borderColor: WOOD.barkDark,
        background: "rgba(11,16,13,0.82)",
        color: WOOD.textDim,
      }}
    >
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#e2b04a" }} />
      <span className="flex-1 text-[11px] leading-snug" style={{ color: WOOD.text }}>
        {t("rateLimit.notice")}
      </span>
      <CloseIcon className="mt-0.5 h-3 w-3 shrink-0" />
    </button>
  );
}
