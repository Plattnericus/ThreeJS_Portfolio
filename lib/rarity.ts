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
