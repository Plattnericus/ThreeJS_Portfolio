import * as THREE from "three";

export type Anchor = { pos: THREE.Vector3 };

/**
 * Samples real points on the tree's BRANCH geometry (the bark meshes), in the
 * tree's local space, so platforms/houses can sit ON actual branches. Uses a
 * standalone clone + updateMatrixWorld so the coordinates match the frame the
 * <Tree> renders in. Deterministic: same seed → same well-spread anchors.
 */
export function sampleBranchAnchors(
  scene: THREE.Object3D,
  count: number,
): Anchor[] {
  const clone = scene.clone(true);
  clone.updateMatrixWorld(true);

  const cand: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  clone.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.name.includes("Bark")) return;
    const pos = o.geometry.getAttribute("position") as THREE.BufferAttribute;
    // subsample for speed
    for (let i = 0; i < pos.count; i += 9) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const r = Math.hypot(v.x, v.z);
      // outer upper branch tips, so houses perch clear of the foliage
      if (v.y > 5.5 && v.y < 9.5 && r > 3.2 && r < 7.6) {
        cand.push(v.clone());
      }
    }
  });

  if (cand.length === 0) return [];
  // deterministic order
  cand.sort((a, b) => b.y - a.y || a.x - b.x);

  // greedy farthest-point sampling for an even spread
  const chosen: THREE.Vector3[] = [cand[0]];
  while (chosen.length < count && chosen.length < cand.length) {
    let best = -1;
    let bestD = -1;
    for (let i = 0; i < cand.length; i++) {
      let dmin = Infinity;
      for (const c of chosen) dmin = Math.min(dmin, cand[i].distanceToSquared(c));
      if (dmin > bestD) {
        bestD = dmin;
        best = i;
      }
    }
    if (best < 0) break;
    chosen.push(cand[best]);
  }

  return chosen.map((pos) => ({ pos }));
}
