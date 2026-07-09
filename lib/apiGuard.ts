import { NextResponse } from "next/server";

// Shared abuse-protection for the public API routes. These endpoints are called
// by the site's OWN browser client (live scene data), so they can't be made
// literally server-only without dropping to SSR and losing live refresh — but
// they CAN be hardened against external exploitation:
//
//   1. Per-IP rate limit (sliding window) — stops anyone hammering the route to
//      burn CPU/bandwidth or probe the cache. This is the real protection.
//   2. Cross-origin rejection — blocks other sites embedding/proxying the API
//      (a foreign Origin/Referer is refused; same-origin browser fetches and
//      server-side/direct requests with no cross-origin signal pass through).
//
// The upstream credentials (GITHUB_TOKEN) and the once-per-cache-window fetching
// already live entirely server-side, so GitHub/Open-Meteo can never be drained
// through these routes no matter how they're hit.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "local";
}

// Same-origin browser GETs often omit Origin and may have Referer stripped by a
// referrer-policy, so a MISSING cross-origin signal is treated as allowed (it's
// either our own client or a server-side/direct request). Only a PRESENT and
// DIFFERENT host is refused — that's an unambiguous cross-site caller.
function sameOriginOk(req: Request): boolean {
  const host = req.headers.get("host");
  if (!host) return true;
  const src = req.headers.get("origin") ?? req.headers.get("referer");
  if (!src) return true;
  try {
    return new URL(src).host === host;
  } catch {
    return false;
  }
}

function rateLimitOk(req: Request, key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  // Periodic sweep so expired buckets don't grow unbounded.
  if (now - lastSweep > 60_000) {
    for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k);
    lastSweep = now;
  }
  const id = `${key}:${clientIp(req)}`;
  const b = buckets.get(id);
  if (!b || now > b.resetAt) {
    buckets.set(id, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

/**
 * Guard a public API route. Returns a NextResponse to short-circuit with (403
 * cross-origin, 429 rate-limited), or null when the request may proceed.
 */
export function guardApi(
  req: Request,
  opts: { key: string; limit: number; windowMs: number },
): NextResponse | null {
  if (!sameOriginOk(req)) {
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }
  if (!rateLimitOk(req, opts.key, opts.limit, opts.windowMs)) {
    return NextResponse.json(
      { error: "rate limited" },
      {
        status: 429,
        headers: {
          "cache-control": "no-store",
          "retry-after": String(Math.ceil(opts.windowMs / 1000)),
        },
      },
    );
  }
  return null;
}
