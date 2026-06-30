import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { STAR_TAG } from "@/app/api/stargazers/route";

// Background refresh of the GitHub stargazer data, triggered by a Vercel Cron
// (see `vercel.json`). This keeps the village fresh even when NOBODY has the
// site open — without it, the data only ever refreshed on a live visit.
//
// Flow: drop the cached GitHub responses (revalidateTag) → immediately re-warm
// them by hitting the public route once, so the very next visitor gets the new
// data instantly instead of paying the GitHub round-trip themselves.
export const dynamic = "force-dynamic";

function siteOrigin(req: Request): string {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  const dep = process.env.VERCEL_URL;
  if (dep) return `https://${dep}`;
  return new URL(req.url).origin;
}

export async function GET(req: Request) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. If the secret is
  // configured, reject anything that doesn't carry it.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  revalidateTag(STAR_TAG, "max");

  // Re-warm the cache (best effort — the revalidate already did the important
  // part of marking the data stale for the next real request).
  let warmed = false;
  try {
    const res = await fetch(`${siteOrigin(req)}/api/stargazers`, { cache: "no-store" });
    warmed = res.ok;
  } catch {
    /* warm-up is optional */
  }

  return NextResponse.json({ ok: true, refreshed: STAR_TAG, warmed, at: Date.now() });
}
