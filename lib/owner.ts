// The portfolio owner (the tracked repo's owner, or an explicit GITHUB_USER).
// Used by SEO metadata + structured data so nothing is hardcoded.

export type Owner = {
  login: string;
  name: string;
  bio: string | null;
  avatarUrl: string;
  htmlUrl: string;
  location: string | null;
  company: string | null;
  blog: string | null;
  twitter: string | null;
  followers: number;
  publicRepos: number;
};

export function ownerLogin(): string {
  if (process.env.GITHUB_USER) return process.env.GITHUB_USER;
  const repo = process.env.GITHUB_REPO ?? "Plattnericus/ThreeJS_Portfolio";
  return repo.split("/")[0];
}

export async function fetchOwner(): Promise<Owner | null> {
  const login = ownerLogin();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "star-tree",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await fetch(`https://api.github.com/users/${login}`, {
      headers,
      next: { revalidate: 3600 }, // dedupes within a render + caches for an hour
    });
    if (!res.ok) return null;
    const u = await res.json();
    return {
      login: u.login,
      name: u.name ?? u.login,
      bio: u.bio ?? null,
      avatarUrl: u.avatar_url,
      htmlUrl: u.html_url,
      location: u.location ?? null,
      company: u.company ?? null,
      blog: u.blog || null,
      twitter: u.twitter_username ?? null,
      followers: u.followers ?? 0,
      publicRepos: u.public_repos ?? 0,
    };
  } catch {
    return null;
  }
}
