import { NextResponse } from "next/server";

// The repo whose stars grow the tree.
const REPO = process.env.GITHUB_REPO ?? "Plattnericus/ThreeJS_Portfolio";

// Revalidate at most once a minute so we stay fresh without burning rate limit.
export const revalidate = 60;

export async function GET() {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "threejs-portfolio",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers,
      next: { revalidate },
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({
        repo: REPO,
        stars: data.stargazers_count ?? 0,
        live: true,
      });
    }

    // Repo not created yet (404) or rate-limited — fall back to a demo value so
    // the scene still renders and growth can be previewed.
    const demo = Number(process.env.DEMO_STARS ?? 0);
    return NextResponse.json({ repo: REPO, stars: demo, live: false });
  } catch {
    const demo = Number(process.env.DEMO_STARS ?? 0);
    return NextResponse.json({ repo: REPO, stars: demo, live: false });
  }
}
