import * as THREE from "three";

/**
 * Returns a new geometry containing only the triangles whose centroid is above
 * `cutoffY` (in the geometry's own space). Used to cut the long hanging weight
 * off the wood platform so only the flat deck remains. Copies position/normal/uv.
 */
export function trimAboveY(
  geo: THREE.BufferGeometry,
  cutoffY: number,
): THREE.BufferGeometry {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const nrm = geo.getAttribute("normal") as THREE.BufferAttribute | undefined;
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute | undefined;
  const index = geo.getIndex();
  const triCount = index ? index.count / 3 : pos.count / 3;

  const P: number[] = [];
  const N: number[] = [];
  const U: number[] = [];
  const vi = (t: number, c: number) => (index ? index.getX(t * 3 + c) : t * 3 + c);

  for (let t = 0; t < triCount; t++) {
    const a = vi(t, 0);
    const b = vi(t, 1);
    const c = vi(t, 2);
    const cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
    if (cy <= cutoffY) continue;
    for (const idx of [a, b, c]) {
      P.push(pos.getX(idx), pos.getY(idx), pos.getZ(idx));
      if (nrm) N.push(nrm.getX(idx), nrm.getY(idx), nrm.getZ(idx));
      if (uv) U.push(uv.getX(idx), uv.getY(idx));
    }
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  if (N.length) out.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  else out.computeVertexNormals();
  if (U.length) out.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
  out.computeBoundingBox();
  return out;
}
