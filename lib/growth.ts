// Growth math. At 0 stars the tree is a tiny sprout (almost nothing). Each star
// reveals more of the trunk + branches (the tree "builds itself") and grows the
// overall size, slowing as it gets bigger so early stars matter most.

const BASE_SCALE = 0.16; // a tiny, almost-dead sprout at 0 stars
const MAX_SCALE = 2.0;
const GROWTH_K = 0.46;

/** Overall tree scale for a given star count. Grows a lot, slowing as it ages. */
export function treeScale(stars: number): number {
  const s = Math.max(0, stars);
  return Math.min(MAX_SCALE, BASE_SCALE + GROWTH_K * Math.log2(s + 1));
}

/**
 * Fraction of the canopy's leaf clusters that are present, so foliage (and the
 * branches it sits on) visibly fills in as stars arrive. 0 stars = sparse young
 * tree; ~12+ stars = full crown.
 */
export function foliageFraction(stars: number): number {
  const s = Math.max(0, stars);
  return Math.min(1, 0.22 + s / 12);
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
