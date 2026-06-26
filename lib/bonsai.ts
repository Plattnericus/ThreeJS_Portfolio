import * as THREE from "three";

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

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

export function trunkCenterAt(u: number): THREE.Vector3 {
  const t = THREE.MathUtils.clamp(u, 0, 1);
  const y = THREE.MathUtils.lerp(0.1, 9.35, t);
  const curl = (1 - t * 0.42) * 0.46;
  return new THREE.Vector3(
    Math.sin(t * Math.PI * 2.15 + 0.42) * curl + Math.sin(t * 8.1) * 0.08,
    y,
    Math.cos(t * Math.PI * 1.65 + 1.1) * curl * 0.7,
  );
}

export function bonsaiNodes(count: number): BonsaiNode[] {
  const out: BonsaiNode[] = [];
  const max = Math.max(1, count - 1);

  for (let i = 0; i < count; i++) {
    const rank = Math.pow(i / max, 0.58);
    const heightT = THREE.MathUtils.lerp(0.9, 0.34, rank);
    const base = trunkCenterAt(heightT);
    const angle = i * GOLDEN + 0.72;
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const tangentTurn = new THREE.Vector3(
      Math.cos(angle + Math.PI * 0.5),
      0,
      Math.sin(angle + Math.PI * 0.5),
    );
    const crown = Math.sin(rank * Math.PI);
    const length = 2.5 + crown * 3.05 + (i % 5) * 0.14;
    const lift = THREE.MathUtils.lerp(0.62, -0.34, rank) + Math.sin(i * 1.73) * 0.1;
    const elbow = base
      .clone()
      .addScaledVector(radial, length * 0.45)
      .addScaledVector(tangentTurn, Math.sin(i * 0.91) * 0.34)
      .add(new THREE.Vector3(0, lift + 0.34, 0));
    const tip = base
      .clone()
      .addScaledVector(radial, length)
      .addScaledVector(tangentTurn, Math.sin(i * 1.37) * 0.5)
      .add(new THREE.Vector3(0, lift, 0));

    out.push({
      index: i,
      base,
      elbow,
      tip,
      angle,
      phase: i * 1.618,
      radius: THREE.MathUtils.lerp(0.27, 0.095, rank),
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
        // root flare near the base (u→0): a few buttress lobes swelling outward.
        const flare = Math.max(0, 1 - u / 0.12);
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
