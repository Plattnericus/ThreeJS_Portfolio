import * as THREE from "three";
import { bonsaiAnchors } from "./bonsai";

export type Anchor = { pos: THREE.Vector3 };

/**
 * Returns deterministic tips on the procedural Bonsai branch system. The
 * argument is kept for the old GLB sampler call sites; the static tree mesh is
 * no longer the source of truth because every star now grows its own branch.
 */
export function sampleBranchAnchors(
  scene: THREE.Object3D | null | undefined,
  count: number,
): Anchor[] {
  void scene;
  return bonsaiAnchors(count);
}
