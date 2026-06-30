import * as THREE from "three";
import { TIER_SIZE, tierForIndex } from "./rarity";

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
// Spiral-tower layout: platforms climb a golden-angle helix up the trunk. As more
// stars arrive the tree grows TALLER *and* fans WIDER — each higher platform sits
// on a larger radius, so the silhouette broadens into a crown instead of a thin
// pole (founder lowest+innermost, newest on top+outermost). Lower pitch keeps the
// platforms close enough in height that they link with walkable BRIDGE ramps
// rather than tall ladders.
const HELIX_R = 5.35; // base horizontal radius of the platform helix (innermost)
// Keep the radius nearly CONSTANT as it climbs so the upper tree reads like the
// lower tree — a tidy column around the trunk, not thin towers fanning off into
// space (owner's "build it upward like it is at the bottom"). A gentle √i spread
// keeps it from looking perfectly cylindrical without breaking the column.
const SPREAD_R = 0.5; // very mild outward fan with height (was a wide broadening)
const Y0 = 3.2; // height of the first (founder) platform — lifted clear of the ground
const PITCH = 1.15; // base vertical rise per platform (low → broad spiral, not a tower)
const GAP_K = 0.14; // extra rise scaled by deck radii (radial spread does the rest)

const MAX_HELIX_R = 7.6; // keep platforms (incl. their decks) in a tidy column over the island
/** Horizontal radius of the platform at slot `i`. Grows with √i so the tower fans
 *  out as it climbs (wider tree with more stars), then clamps so even a crowded
 *  tower stays on the island rather than hanging off into open sky. */
export function slotRadius(i: number): number {
  return Math.min(MAX_HELIX_R, HELIX_R + SPREAD_R * Math.sqrt(Math.max(0, i)));
}

export type BonsaiNode = {
  index: number;
  base: THREE.Vector3;
  elbow: THREE.Vector3;
  tip: THREE.Vector3;
  angle: number;
  phase: number;
  radius: number;
};

export type BonsaiAnchor = { pos: THREE.Vector3 };

/** Trunk centre at an absolute height `y` — a gentle organic lean/wiggle that
 *  grows slowly so even a very tall trunk curves naturally without drifting the
 *  helix platforms off the column. Valid for any y (the trunk is now tall). */
export function spineAt(y: number): THREE.Vector3 {
  // a clean bonsai S-curve: one low-frequency bend (mainly in X) with amplitude
  // growing up the height, plus a gentle secondary sway in Z. No high-freq wiggle.
  const amp = 0.5 + Math.max(0, y) * 0.035;
  return new THREE.Vector3(
    Math.sin(y * 0.21) * amp,
    y,
    Math.sin(y * 0.13 + 0.7) * amp * 0.35,
  );
}

/** Deck radius a platform at slot `i` will occupy — from its STABLE fallback tier
 *  (positions must not shift when live stargazer data loads). Matches
 *  `deckRadius` in rarity.ts (TIER_SIZE * 1.5). */
function slotDeckRadius(i: number): number {
  return TIER_SIZE[tierForIndex(i)] * 1.5;
}

/** Height of the platform at slot `i` (cumulative size-aware pitch up the helix). */
export function slotHeight(i: number): number {
  let y = Y0;
  let prevR = slotDeckRadius(0);
  for (let k = 1; k <= i; k++) {
    const r = slotDeckRadius(k);
    y += PITCH + GAP_K * (prevR + r);
    prevR = r;
  }
  return y;
}

export function bonsaiNodes(count: number): BonsaiNode[] {
  const out: BonsaiNode[] = [];
  for (let i = 0; i < count; i++) {
    const y = slotHeight(i);
    const angle = i * GOLDEN + 0.72;
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const r = slotRadius(i);
    const base = spineAt(y);
    const tip = base
      .clone()
      .addScaledVector(radial, r)
      .add(new THREE.Vector3(0, 0.25, 0));
    const elbow = base
      .clone()
      .addScaledVector(radial, r * 0.5)
      .add(new THREE.Vector3(0, 0.34, 0));

    out.push({
      index: i,
      base,
      elbow,
      tip,
      angle,
      phase: i * 1.618,
      radius: 0.16,
    });
  }
  return out;
}

export function bonsaiAnchors(count: number): BonsaiAnchor[] {
  return bonsaiNodes(count).map((node) => ({ pos: node.tip.clone() }));
}

export function makeTaperedTubeGeometry(
  points: THREE.Vector3[],
  radiusStart: number,
  radiusEnd: number,
  tubularSegments = 24,
  radialSegments = 8,
  barkTwist = 0,
  irregularity = 0,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const fallback = new THREE.Vector3(1, 0, 0);
  let normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    const u = i / tubularSegments;
    const center = curve.getPointAt(u);
    const tangent = curve.getTangentAt(u).normalize();
    if (i === 0) {
      normal.crossVectors(tangent, up);
      if (normal.lengthSq() < 0.0001) normal.copy(fallback);
      normal.normalize();
    }
    binormal.crossVectors(tangent, normal).normalize();
    normal.crossVectors(binormal, tangent).normalize();
    const taper = Math.pow(1 - u, 0.72);
    const radius = THREE.MathUtils.lerp(radiusEnd, radiusStart, taper);

    for (let j = 0; j <= radialSegments; j++) {
      const v = j / radialSegments;
      const a = v * Math.PI * 2 + barkTwist + u * 1.4;
      let ridge = 1 + Math.sin(a * 3 + u * 18 + barkTwist) * 0.035;
      if (irregularity > 0) {
        // integer multiples of `a` stay seamless around the ring → a non-circular,
        // fluted cross-section that drifts along the height (organic, not a pipe).
        const lobe =
          Math.sin(a * 2 + u * 3.0) * 0.55 +
          Math.sin(a * 3 - u * 2.0 + 1.7) * 0.3 +
          Math.sin(a * 5 + u * 1.3 + 0.5) * 0.16;
        const along = Math.sin(u * 6.0 + barkTwist) * 0.4 + Math.sin(u * 13.0) * 0.2;
        // root flare near the REAL base (absolute height, so it stays at the foot
        // of even a very tall trunk): a few buttress lobes swelling outward.
        const flare = Math.max(0, 1 - center.y / 1.6);
        ridge +=
          irregularity *
          (lobe * 0.13 +
            along * 0.07 +
            flare * flare * (0.5 + 0.5 * Math.sin(a * 4 + barkTwist)) * 0.4);
      }
      const ring = normal
        .clone()
        .multiplyScalar(Math.cos(a))
        .addScaledVector(binormal, Math.sin(a))
        .normalize();
      const p = center.clone().addScaledVector(ring, radius * ridge);
      positions.push(p.x, p.y, p.z);
      normals.push(ring.x, ring.y, ring.z);
      uvs.push(u, v);
    }
  }

  const stride = radialSegments + 1;
  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + j + 1;
      const d = i * stride + j + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  // Keep the analytic outward ring-normals (recomputing from the displaced,
  // seam-duplicated tube could flip/zero them and make a side go dark/invisible).
  geo.computeBoundingSphere();
  return geo;
}
