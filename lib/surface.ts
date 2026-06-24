import * as THREE from "three";

// A radial height profile of the island's TOP surface, derived directly from the
// mesh vertices (one fast pass — no per-ray mesh traversal, so it never blocks
// the load). Lets us carpet the whole plateau with grass that sits exactly on
// the ground, out to the real top edge — and not down the cliff sides.
export type SurfaceProfile = {
  heightAt: (r: number) => number; // surface Y at distance r from the centre
  edgeR: number; // largest radius that is still plateau top
};

export function sampleIslandSurface(
  scene: THREE.Object3D,
  scale: number,
  rings = 56,
  rMax = 16,
): SurfaceProfile {
  const top = new Float32Array(rings).fill(-Infinity);
  const clone = scene.clone(true); // shares geometry; cheap
  clone.updateMatrixWorld(true);

  const v = new THREE.Vector3();
  clone.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.getAttribute("position") as THREE.BufferAttribute;
    // subsample for speed — plenty of points for a smooth profile
    for (let i = 0; i < pos.count; i += 3) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).multiplyScalar(scale);
      const r = Math.hypot(v.x, v.z);
      const ri = Math.floor((r / rMax) * rings);
      if (ri >= 0 && ri < rings && v.y > top[ri]) top[ri] = v.y;
    }
  });

  // Global top, used to keep grass on the plateau (not the steep sides).
  let globalTop = -Infinity;
  for (let i = 0; i < rings; i++) if (top[i] > globalTop) globalTop = top[i];
  if (globalTop === -Infinity) globalTop = 5.4;

  // Fill empty rings from the nearest known one so heightAt is continuous.
  const H: number[] = new Array(rings);
  let last = globalTop;
  for (let i = 0; i < rings; i++) {
    if (top[i] === -Infinity) H[i] = last;
    else H[i] = last = top[i];
  }

  // Plateau edge = furthest ring whose top is still within ~2.4u of the summit.
  let edgeR = rMax * 0.5;
  for (let i = rings - 1; i >= 0; i--) {
    if (top[i] !== -Infinity && top[i] >= globalTop - 2.4) {
      edgeR = (i / (rings - 1)) * rMax;
      break;
    }
  }

  const heightAt = (r: number) => {
    const f = Math.max(0, Math.min(rings - 1, (r / rMax) * (rings - 1)));
    const i0 = Math.floor(f);
    const i1 = Math.min(rings - 1, i0 + 1);
    return THREE.MathUtils.lerp(H[i0], H[i1], f - i0);
  };

  return { heightAt, edgeR };
}
