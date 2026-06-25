import { NextResponse } from "next/server";
import type { Stargazer } from "@/lib/stargazers";
import { tierFromProfile } from "@/lib/rarity";

const REPO = process.env.GITHUB_REPO ?? "Plattnericus/ThreeJS_Portfolio";
const ENRICH = 30; // how many stargazers to enrich with a profile fetch

export const revalidate = 300; // refresh at most every 5 min (enrichment is call-heavy)

function ghHeaders(accept = "application/vnd.github+json") {
  const h: Record<string, string> = {
    Accept: accept,
    "User-Agent": "threejs-portfolio",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

export async function GET() {
  try {
    // 1) repo info → star count + existence
    const repoRes = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: ghHeaders(),
      next: { revalidate },
    });
    if (!repoRes.ok) {
      const demo = Number(process.env.DEMO_STARS ?? 0);
      return NextResponse.json({ repo: REPO, stars: demo, live: false, stargazers: null });
    }
    const repo = await repoRes.json();
    const stars: number = repo.stargazers_count ?? 0;

    // 2) stargazers (login + avatar), earliest first.
    const sgRes = await fetch(
      `https://api.github.com/repos/${REPO}/stargazers?per_page=40`,
      { headers: ghHeaders("application/vnd.github.star+json"), next: { revalidate } },
    );
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
    }

    // 3) contributors → who worked on the repo + their commit counts.
    const commitsByLogin = new Map<string, number>();
    try {
      const cRes = await fetch(
        `https://api.github.com/repos/${REPO}/contributors?per_page=100`,
        { headers: ghHeaders(), next: { revalidate } },
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

    // 4) enrich each stargazer with their profile → compute the REAL tier.
    if (stargazers && stargazers.length) {
      const slice = stargazers.slice(0, ENRICH);
      await Promise.all(
        slice.map(async (sg) => {
          try {
            const uRes = await fetch(`https://api.github.com/users/${sg.login}`, {
              headers: ghHeaders(),
              next: { revalidate },
            });
            const u = uRes.ok ? await uRes.json() : {};
            const commits = commitsByLogin.get(sg.login.toLowerCase()) ?? 0;
            const ageYears = u.created_at
              ? (Date.now() - new Date(u.created_at).getTime()) / 3.15576e10
              : 0;
            sg.followers = u.followers ?? 0;
            sg.commits = commits;
            sg.contributor = commits > 0;
            sg.tier = tierFromProfile({
              login: sg.login,
              followers: u.followers ?? 0,
              publicRepos: u.public_repos ?? 0,
              accountAgeYears: ageYears,
              isContributor: commits > 0,
              commits,
            });
          } catch {
            /* leave tier undefined → client falls back to deterministic */
          }
        }),
      );
    }

    return NextResponse.json({ repo: REPO, stars, live: true, stargazers });
  } catch {
    const demo = Number(process.env.DEMO_STARS ?? 0);
    return NextResponse.json({ repo: REPO, stars: demo, live: false, stargazers: null });
  }
}
