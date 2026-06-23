import * as THREE from "three";
import { Tier, tierForIndex } from "./rarity";
import { nameForIndex } from "./names";

export const MAX_HOUSES = 40;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export type Slot = {
  pos: THREE.Vector3;
  tier: Tier;
  name: string;
  phase: number;
};

// Deterministic house placement around the canopy (founders higher). Shared by
// the houses and the bridges so they line up.
export function houseSlots(): Slot[] {
  const out: Slot[] = [];
  for (let i = 0; i < MAX_HOUSES; i++) {
    const t = i / (MAX_HOUSES - 1);
    const y = THREE.MathUtils.lerp(8.4, 4.8, t);
    const radius = 4.4 + 2.6 * Math.sin(t * Math.PI);
    const angle = i * GOLDEN + 0.6;
    out.push({
      pos: new THREE.Vector3(
        Math.cos(angle) * radius,
        y,
        Math.sin(angle) * radius,
      ),
      tier: tierForIndex(i),
      name: nameForIndex(i),
      phase: i * 1.7,
    });
  }
  return out;
}
