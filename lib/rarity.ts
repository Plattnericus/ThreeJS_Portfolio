// Rarity tiers and the village building each maps to. Final tier will come from
// stargazer clout + contributor bonus; for the prototype we assign a
// deterministic, common-weighted tier per stargazer index.

export type Tier = "common" | "uncommon" | "rare" | "legendary";

export const TIER_BUILDING: Record<Tier, string> = {
  common: "FarmCarrot_Material_0",
  uncommon: "FishermanMarket_Material_0",
  rare: "ForgeHouse_Material_0",
  legendary: "Barracks_Material_0",
};

export const TIER_COLOR: Record<Tier, string> = {
  common: "#9aa6a0",
  uncommon: "#5fae6a",
  rare: "#4a8fe0",
  legendary: "#e0a04a",
};

// Deterministic pseudo-random in [0,1) from an integer seed.
function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Weighted tier for a stargazer index: mostly common, rarely legendary. */
export function tierForIndex(i: number): Tier {
  const r = rand(i + 1);
  if (r > 0.93) return "legendary";
  if (r > 0.78) return "rare";
  if (r > 0.5) return "uncommon";
  return "common";
}

// ---- Real rarity from the stargazer's GitHub profile --------------------------

export type RarityInput = {
  login: string;
  followers: number;
  publicRepos: number;
  accountAgeYears: number;
  isContributor: boolean;
  commits: number; // commits to the tracked repo (0 if not a contributor)
};

/**
 * A "clout" score. The strongest signal is being a contributor to the repo, then
 * followers + commits, then a bonus for a short handle, account age and repos.
 */
export function rarityScore(p: RarityInput): number {
  let s = 0;
  s += Math.log10(p.followers + 1) * 1.7; // followers count a lot
  s += Math.log10(p.publicRepos + 1) * 0.7;
  s += Math.min(p.accountAgeYears, 14) * 0.13; // veterans
  const n = p.login.length; // short, memorable handle
  s += n <= 5 ? 1.7 : n <= 8 ? 1.0 : n <= 11 ? 0.4 : 0;
  if (p.isContributor) s += 3.4 + Math.log10(p.commits + 1) * 1.9; // big boost
  return s;
}

/**
 * Tier from the real profile. Contributors are AT LEAST `rare` (one step below
 * legendary) and become legendary with a strong profile / many commits.
 */
export function tierFromProfile(p: RarityInput): Tier {
  const s = rarityScore(p);
  if (p.isContributor) return s >= 6.8 ? "legendary" : "rare";
  if (s >= 6.0) return "legendary";
  if (s >= 3.6) return "rare";
  if (s >= 1.8) return "uncommon";
  return "common";
}

/** Resolved tier for house i: real stargazer tier if known, else deterministic. */
export function resolveTier(
  i: number,
  stargazers?: { tier?: Tier }[] | null,
): Tier {
  return (stargazers && stargazers[i]?.tier) || tierForIndex(i);
}
