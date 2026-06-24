import { NextResponse } from "next/server";
import { langColor } from "@/lib/langColors";

// Real GitHub data for a single stargazer (the person a house belongs to):
// profile + their top repositories by stars. Fetched lazily when a house opens.
// Token-free (60 req/h); a GITHUB_TOKEN only raises the limit.

export const revalidate = 600;

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "star-tree",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

export async function GET(req: Request) {
  const login = new URL(req.url).searchParams.get("login");
  if (!login || !/^[a-zA-Z0-9-]+$/.test(login)) {
    return NextResponse.json({ error: "bad login" }, { status: 400 });
  }

  try {
    const [uRes, rRes] = await Promise.all([
      fetch(`https://api.github.com/users/${login}`, {
        headers: headers(),
        next: { revalidate },
      }),
      fetch(
        `https://api.github.com/users/${login}/repos?per_page=100&type=owner&sort=pushed`,
        { headers: headers(), next: { revalidate } },
      ),
    ]);

    if (!uRes.ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    const u = await uRes.json();

    let topRepos: {
      name: string;
      stars: number;
      lang: string | null;
      langColor: string;
      url: string;
    }[] = [];
    if (rRes.ok) {
      const all = await rRes.json();
      topRepos = (Array.isArray(all) ? all : [])
        .filter((r: any) => !r.fork)
        .sort((a: any, b: any) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0))
        .slice(0, 4)
        .map((r: any) => ({
          name: r.name,
          stars: r.stargazers_count ?? 0,
          lang: r.language ?? null,
          langColor: langColor(r.language),
          url: r.html_url,
        }));
    }

    return NextResponse.json({
      login: u.login,
      name: u.name ?? u.login,
      bio: u.bio ?? null,
      avatarUrl: u.avatar_url,
      followers: u.followers ?? 0,
      following: u.following ?? 0,
      location: u.location ?? null,
      publicRepos: u.public_repos ?? 0,
      htmlUrl: u.html_url,
      topRepos,
    });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
