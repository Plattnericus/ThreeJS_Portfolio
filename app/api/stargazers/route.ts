import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { Stargazer } from "@/lib/stargazers";
import { maxTier, tierFromContributor, tierFromProfile } from "@/lib/rarity";
import { guardApi } from "@/lib/apiGuard";

const REPO = process.env.GITHUB_REPO ?? "Plattnericus/ThreeJS_Portfolio";
const ENRICH = 40; // how many stargazers to enrich with a profile fetch

// ---- STRICT rate-limit protection -------------------------------------------
// GitHub is contacted AT MOST once per CACHE_MS, no matter how many visitors,
// tabs or reloads hit this route:
//   1. In-memory payload cache (5 min) — fresh hits never touch GitHub.
//   2. In-flight coalescing — concurrent requests share ONE refresh.
//   3. Next data cache on every GitHub fetch (revalidate) as a second layer
//      that also survives serverless instance swaps.
//   4. Rate-limit/error responses serve the LAST GOOD payload (stale is far
//      better than demo) and back off before retrying.
//   5. Without a GITHUB_TOKEN only 60 req/h are allowed — profile enrichment is
//      skipped, but contributor detection still runs so a refresh costs 3 calls.
// Budget with token: ~43 calls per refresh × 12/h ≈ 520/h of 5000. Without
// token: 3 × 12 = 36/h of 60. Both safely inside the limits.
const CACHE_MS = 5 * 60 * 1000;
const ERROR_RETRY_MS = 60 * 1000; // don't hammer GitHub after a failure
export const dynamic = "force-dynamic";

type Payload = {
  repo: string;
  stars: number;
  live: boolean;
  stargazers: Stargazer[] | null;
  fetchedAt: number;
  // True only when the MOST RECENT GitHub fetch attempt hit the rate limit —
  // distinct from "no data yet" (false) so the client can tell those apart.
  rateLimited: boolean;
};

// Module-level state survives across requests within a server instance.
const state: {
  cached: Payload | null;
  lastGood: Payload | null;
  nextAttempt: number;
  inflight: Promise<Payload> | null;
  diskChecked: boolean;
  profileDiskChecked: boolean;
  lastRateLimited: boolean;
} = {
  cached: null,
  lastGood: null,
  nextAttempt: 0,
  inflight: null,
  diskChecked: false,
  profileDiskChecked: false,
  lastRateLimited: false,
};

// Persistent layer: the payload is also written to disk so the cache SURVIVES
// server restarts, dev hot-reloads (which reset module state!) and serverless
// cold starts — a fresh process serves from disk instead of hitting GitHub.
const CACHE_FILE = path.join(os.tmpdir(), "star-tree-stargazers-cache.json");

async function readDiskCache(): Promise<Payload | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    const p = JSON.parse(raw) as Payload;
    if (typeof p?.fetchedAt !== "number" || typeof p?.stars !== "number") return null;
    return { ...p, rateLimited: Boolean(p.rateLimited) };
  } catch {
    return null;
  }
}

function writeDiskCache(p: Payload) {
  fs.writeFile(CACHE_FILE, JSON.stringify(p)).catch(() => {
    /* disk cache is best-effort */
  });
}

// Enriched profiles barely change — remember them for an hour so refreshes
// don't re-fetch the same 30 users. Also persisted to disk (same pattern as
// the main payload cache) so a dev-server restart / cold start doesn't force
// a full re-enrichment burst against the tight unauthenticated rate limit.
const profileCache = new Map<string, { at: number; data: Partial<Stargazer> }>();
const PROFILE_MS = 60 * 60 * 1000;
const PROFILE_CACHE_FILE = path.join(os.tmpdir(), "star-tree-profile-cache.json");

async function readProfileDiskCache(): Promise<[string, { at: number; data: Partial<Stargazer> }][] | null> {
  try {
    const raw = await fs.readFile(PROFILE_CACHE_FILE, "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

function writeProfileDiskCache() {
  fs.writeFile(PROFILE_CACHE_FILE, JSON.stringify(Array.from(profileCache.entries()))).catch(() => {
    /* disk cache is best-effort */
  });
}

function ghHeaders(accept = "application/vnd.github+json") {
  const h: Record<string, string> = {
    Accept: accept,
    "User-Agent": "threejs-portfolio",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

function json(data: Payload) {
  return NextResponse.json(data, {
    headers: {
      // CDN caches the payload for 5 min too (third protective layer); the
      // browser itself revalidates so the client-side 5-min timer stays exact.
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
    },
  });
}

function demoPayload(rateLimited = false): Payload {
  return {
    repo: REPO,
    stars: Number(process.env.DEMO_STARS ?? 0),
    live: false,
    stargazers: null,
    fetchedAt: Date.now(),
    rateLimited,
  };
}

function rateLimited(res: Response): boolean {
  if (res.status === 429) return true;
  return res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0";
}

function applyContributorBoost(
  stargazers: Stargazer[] | null,
  commitsByLogin: Map<string, number>,
) {
  if (!stargazers) return;
  for (const sg of stargazers) {
    const commits = commitsByLogin.get(sg.login.toLowerCase()) ?? 0;
    if (commits <= 0) continue;
    sg.commits = commits;
    sg.contributor = true;
    sg.tier = maxTier(sg.tier, tierFromContributor(commits));
  }
}

async function fetchFromGitHub(lastGood: Payload | null): Promise<Payload> {
  const authed = Boolean(process.env.GITHUB_TOKEN);

  // 1) repo info → star count + existence
  const repoRes = await fetch(`https://api.github.com/repos/${REPO}`, {
    headers: ghHeaders(),
    next: { revalidate: 300 },
  });
  if (rateLimited(repoRes)) throw new Error("rate-limited");
  if (!repoRes.ok) throw new Error(`repo ${repoRes.status}`);
  const repo = await repoRes.json();
  const stars: number = repo.stargazers_count ?? 0;

  // 2) stargazers (login + avatar), earliest first.
  const sgRes = await fetch(
    `https://api.github.com/repos/${REPO}/stargazers?per_page=40`,
    {
      headers: ghHeaders("application/vnd.github.star+json"),
      next: { revalidate: 300 },
    },
  );
  if (rateLimited(sgRes)) throw new Error("rate-limited");
  let stargazers: Stargazer[] | null = null;
  if (sgRes.ok) {
    const arr = await sgRes.json();
    stargazers = (Array.isArray(arr) ? arr : [])
      .map((e: any) => e.user ?? e)
      .filter((u: any) => u && u.login)
      .map((u: any) => ({
        login: u.login,
        avatarUrl: u.avatar_url,
        profileUrl: u.html_url,
      }));
  } else if (lastGood?.stargazers?.length) {
    // GitHub's stargazers LIST endpoint can 401 ("Requires authentication")
    // even for a public repo when unauthenticated, distinct from the 429/403
    // rate-limit signal `rateLimited()` checks for — so this path is easy to
    // hit with no GITHUB_TOKEN configured. Never regress real logins we
    // already have back to null (→ placeholder names) on a fetch hiccup; keep
    // showing the last known-good stargazer list while `stars` still updates
    // live from the (always-public) repo endpoint above.
    stargazers = lastGood.stargazers;
  }

  // 3) contributors → who worked on the repo + their commit counts.
  const commitsByLogin = new Map<string, number>();
  try {
    const cRes = await fetch(
      `https://api.github.com/repos/${REPO}/contributors?per_page=100`,
      { headers: ghHeaders(), next: { revalidate: 300 } },
    );
    if (cRes.ok) {
      const list = await cRes.json();
      for (const c of Array.isArray(list) ? list : []) {
        if (c?.login) commitsByLogin.set(c.login.toLowerCase(), c.contributions ?? 0);
      }
    }
  } catch {
    /* contributors optional */
  }
  applyContributorBoost(stargazers, commitsByLogin);

  // Unauthenticated: stop here. Contributors are still boosted; non-contributor
  // tiers fall back to the deterministic client seed.
  if (!authed) {
    return { repo: REPO, stars, live: true, stargazers, fetchedAt: Date.now(), rateLimited: false };
  }

  // 4) enrich each stargazer with their profile → compute the REAL tier.
  //    Profiles are memoized for an hour, so most refreshes cost 0 extra calls.
  if (stargazers && stargazers.length) {
    const slice = stargazers.slice(0, ENRICH);
    await Promise.all(
      slice.map(async (sg) => {
        const hit = profileCache.get(sg.login.toLowerCase());
        const commits = commitsByLogin.get(sg.login.toLowerCase()) ?? 0;
        if (hit && Date.now() - hit.at < PROFILE_MS) {
          Object.assign(sg, hit.data);
          applyContributorBoost([sg], commitsByLogin);
          return;
        }
        try {
          const uRes = await fetch(`https://api.github.com/users/${sg.login}`, {
            headers: ghHeaders(),
            next: { revalidate: 3600 },
          });
          const u = uRes.ok ? await uRes.json() : {};
          const ageYears = u.created_at
            ? (Date.now() - new Date(u.created_at).getTime()) / 3.15576e10
            : 0;
          const data: Partial<Stargazer> = {
            followers: u.followers ?? 0,
            tier: tierFromProfile({
              login: sg.login,
              followers: u.followers ?? 0,
              publicRepos: u.public_repos ?? 0,
              accountAgeYears: ageYears,
              isContributor: commits > 0,
              commits,
            }),
          };
          profileCache.set(sg.login.toLowerCase(), { at: Date.now(), data });
          Object.assign(sg, data, { commits, contributor: commits > 0 });
          applyContributorBoost([sg], commitsByLogin);
        } catch {
          /* leave tier undefined → client falls back to deterministic */
        }
      }),
    );
    writeProfileDiskCache();
  }

  return { repo: REPO, stars, live: true, stargazers, fetchedAt: Date.now(), rateLimited: false };
}

export async function GET(req: Request) {
  // The heavy work is already cached, but this stops external hammering/probing.
  const blocked = guardApi(req, { key: "stargazers", limit: 30, windowMs: 60_000 });
  if (blocked) return blocked;

  const now = Date.now();

  // Cold start / hot-reload: hydrate module state from the disk cache first.
  if (!state.cached && !state.diskChecked) {
    state.diskChecked = true;
    const disk = await readDiskCache();
    if (disk && disk.live) {
      state.cached = disk;
      state.lastGood = disk;
    }
  }
  if (!state.profileDiskChecked) {
    state.profileDiskChecked = true;
    const diskProfiles = await readProfileDiskCache();
    if (diskProfiles) {
      for (const [login, entry] of diskProfiles) profileCache.set(login, entry);
    }
  }

  // Fresh cache → GitHub is not touched at all.
  if (state.cached && now - state.cached.fetchedAt < CACHE_MS) {
    return json(state.cached);
  }

  // Back-off window after an error → serve the last good payload meanwhile,
  // tagged with whatever the last fetch attempt actually found.
  if (now < state.nextAttempt) {
    const fallback = state.lastGood
      ? { ...state.lastGood, rateLimited: state.lastRateLimited }
      : demoPayload(state.lastRateLimited);
    return json(fallback);
  }

  // Coalesce: all concurrent requests share ONE GitHub refresh.
  if (!state.inflight) {
    state.inflight = fetchFromGitHub(state.lastGood)
      .then((payload) => {
        state.cached = payload;
        state.lastGood = payload;
        state.nextAttempt = 0;
        state.lastRateLimited = false;
        writeDiskCache(payload);
        return payload;
      })
      .catch((err) => {
        // Rate-limited or failed: keep serving the previous payload and wait
        // before trying GitHub again. Only a genuine rate-limit hit sets the
        // flag the client shows a notice for — other errors (network hiccup,
        // 401 on the stargazers list, etc.) stay silent as before.
        state.nextAttempt = Date.now() + ERROR_RETRY_MS;
        state.lastRateLimited = err instanceof Error && err.message === "rate-limited";
        if (state.lastGood) return { ...state.lastGood, rateLimited: state.lastRateLimited };
        throw err;
      })
      .finally(() => {
        state.inflight = null;
      });
  }

  try {
    return json(await state.inflight);
  } catch {
    return json(demoPayload(state.lastRateLimited));
  }
}
