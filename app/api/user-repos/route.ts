import { NextResponse } from "next/server";
import type { StarRepo } from "@/lib/stargazers";
import { guardApi } from "@/lib/apiGuard";

// Top repos for one user — fetched lazily when a house is opened, so we make at
// most one request per click (stays well under the token-free 60/h limit).
export const revalidate = 600;

export async function GET(req: Request) {
  const blocked = guardApi(req, { key: "user-repos", limit: 40, windowMs: 60_000 });
  if (blocked) return blocked;

  const login = new URL(req.url).searchParams.get("login");
  if (!login || !/^[a-zA-Z0-9-]+$/.test(login)) {
    return NextResponse.json({ repos: [] });
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "threejs-portfolio",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  try {
    const res = await fetch(
      `https://api.github.com/users/${login}/repos?per_page=100&type=owner&sort=pushed`,
      { headers, next: { revalidate } },
    );
    if (!res.ok) return NextResponse.json({ repos: [] });
    const all = await res.json();

    const repos: StarRepo[] = (Array.isArray(all) ? all : [])
      .filter((r: any) => !r.fork)
      .sort((a: any, b: any) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0))
      .slice(0, 3)
      .map((r: any) => ({
        name: r.name,
        stars: r.stargazers_count ?? 0,
        lang: r.language ?? "—",
      }));

    return NextResponse.json({ repos });
  } catch {
    return NextResponse.json({ repos: [] });
  }
}
