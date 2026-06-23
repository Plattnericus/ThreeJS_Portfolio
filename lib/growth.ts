// Growth math. At 0 stars the tree is a tiny sprout (almost nothing). Each star
// reveals more of the trunk + branches (the tree "builds itself") and grows the
// overall size, slowing as it gets bigger so early stars matter most.

const BASE_SCALE = 0.45; // small but complete tree at 0 stars
const MAX_SCALE = 1.5;
const GROWTH_K = 0.3;

/** Overall tree scale for a given star count. Slows as it grows. */
export function treeScale(stars: number): number {
  const s = Math.max(0, stars);
  return Math.min(MAX_SCALE, BASE_SCALE + GROWTH_K * Math.log2(s + 1));
}

/**
 * Vertical reveal 0..1 for the growth shader. 0 stars ≈ a nub; each star reveals
 * more height + branches. Asymptotes toward 1 around ~12 stars.
 */
export function growthProgress(stars: number): number {
  const s = Math.max(0, stars);
  if (s <= 0) return 0.08; // barely a sprout
  return Math.min(1, 1 - Math.pow(0.78, s));
}

/** How many leaves / houses are on the tree — one per star. */
export function leafCount(stars: number): number {
  return Math.max(0, Math.floor(stars));
}
