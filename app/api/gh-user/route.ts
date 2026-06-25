import { NextResponse } from "next/server";
import { langColor } from "@/lib/langColors";

// Real GitHub data for a single stargazer (the person a house belongs to). We
// return enough to render a GitHub-style profile card: profile fields, pinned
// repositories, the owner's repositories, and the rendered profile README (the
// special <login>/<login> repo). Fetched lazily when a house opens.
// Token-free (60 req/h core); a GITHUB_TOKEN only raises the limit. Pinned repos
// have no REST endpoint, so we read them from the public profile HTML.

export const revalidate = 600;

type Repo = {
  name: string;
  owner: string;
  description: string | null;
  stars: number;
  lang: string | null;
  langColor: string;
  url: string;
  pushedAt: string | null;
  fork: boolean;
};

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "star-tree",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

// Pinned repos aren't in the REST API. Parse them from the public profile page.
async function fetchPinned(login: string): Promise<Repo[]> {
  try {
    const res = await fetch(`https://github.com/${login}`, {
      headers: { "User-Agent": "Mozilla/5.0 (star-tree)" },
      next: { revalidate },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const m = html.match(/js-pinned-items-reorder-list([\s\S]*?)<\/ol>/);
    if (!m) return [];
    const items = m[1].split("pinned-item-list-item-content").slice(1);
    const out: Repo[] = [];
    for (const it of items) {
      const href = it.match(/href="(\/[^"]+)"/);
      const name = it.match(/class="repo"[^>]*>([^<]+)/);
      if (!href || !name) continue;
      const [, owner = login, repo = name[1]] = href[1].split("/");
      const desc = it.match(/pinned-item-desc[^>]*>([\s\S]*?)<\/p>/);
      const lang = it.match(/programmingLanguage"[^>]*>([^<]+)/);
      const color = it.match(/repo-language-color[^>]*background-color:\s*([^;"]+)/);
      const stars = it.match(/\/stargazers"[^>]*>([\s\S]*?)<\/a>/);
      const starN = stars
        ? parseInt(stars[1].replace(/<[^>]+>/g, "").replace(/[^0-9]/g, ""), 10)
        : 0;
      out.push({
        name: name[1].trim(),
        owner,
        description: desc ? decode(desc[1].replace(/<[^>]+>/g, "").trim()) || null : null,
        stars: Number.isFinite(starN) ? starN : 0,
        lang: lang ? lang[1].trim() : null,
        langColor: color ? color[1].trim() : langColor(lang ? lang[1].trim() : null),
        url: `https://github.com${href[1]}`,
        pushedAt: null,
        fork: false,
      });
    }
    return out;
  } catch {
    return [];
  }
}

// The rendered profile README HTML, with repo-relative asset/link URLs rewritten
// to absolute so images and links resolve outside github.com.
async function fetchReadmeHtml(login: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${login}/${login}/readme`,
      {
        headers: { ...headers(), Accept: "application/vnd.github.html+json" },
        next: { revalidate },
      },
    );
    if (!res.ok) return null;
    const html = await res.text();
    const rawBase = `https://raw.githubusercontent.com/${login}/${login}/HEAD/`;
    const blobBase = `https://github.com/${login}/${login}/blob/HEAD/`;
    const isAbs = (u: string) =>
      /^(https?:)?\/\//.test(u) || u.startsWith("#") || u.startsWith("mailto:") || u.startsWith("data:");
    return html
      .replace(/src="([^"]+)"/g, (full, u) => (isAbs(u) ? full : `src="${rawBase}${u.replace(/^\.?\//, "")}"`))
      .replace(/href="([^"]+)"/g, (full, u) =>
        isAbs(u) ? full : `href="${blobBase}${u.replace(/^\.?\//, "")}"`,
      );
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const login = new URL(req.url).searchParams.get("login");
  if (!login || !/^[a-zA-Z0-9-]+$/.test(login)) {
    return NextResponse.json({ error: "bad login" }, { status: 400 });
  }

  try {
    const [uRes, rRes, pinned, readmeHtml] = await Promise.all([
      fetch(`https://api.github.com/users/${login}`, { headers: headers(), next: { revalidate } }),
      fetch(
        `https://api.github.com/users/${login}/repos?per_page=100&type=owner&sort=pushed`,
        { headers: headers(), next: { revalidate } },
      ),
      fetchPinned(login),
      fetchReadmeHtml(login),
    ]);

    if (!uRes.ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    const u = await uRes.json();

    let repos: Repo[] = [];
    if (rRes.ok) {
      const all = await rRes.json();
      repos = (Array.isArray(all) ? all : [])
        .filter((r: any) => !r.fork)
        .map((r: any) => ({
          name: r.name,
          owner: r.owner?.login ?? login,
          description: r.description ?? null,
          stars: r.stargazers_count ?? 0,
          lang: r.language ?? null,
          langColor: langColor(r.language),
          url: r.html_url,
          pushedAt: r.pushed_at ?? null,
          fork: false,
        }));
    }

    // Pinned takes the description/color from the scrape; if a stargazer hasn't
    // pinned anything, fall back to their top repos by stars so the card isn't empty.
    const topByStars = [...repos].sort((a, b) => b.stars - a.stars).slice(0, 6);

    return NextResponse.json({
      login: u.login,
      name: u.name ?? u.login,
      bio: u.bio ?? null,
      avatarUrl: u.avatar_url,
      followers: u.followers ?? 0,
      following: u.following ?? 0,
      location: u.location ?? null,
      company: u.company ?? null,
      blog: u.blog || null,
      twitter: u.twitter_username ?? null,
      publicRepos: u.public_repos ?? 0,
      htmlUrl: u.html_url,
      pinned: pinned.length ? pinned : topByStars,
      pinnedIsFallback: pinned.length === 0,
      repos,
      readmeHtml,
    });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
