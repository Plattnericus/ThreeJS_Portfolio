import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// The bird/dove GLB has folded wings and no wing bones, so it can't flap. These
// procedural wings give a real, visible wing-beat: a fan of feathers on a
// shoulder pivot — rotate the returned group's .z to flap. Feathers are merged
// into ONE mesh (one draw call) and two-toned via vertex colours.

export type Wing = THREE.Group;

// One feather pointing +x, lying in the wing (xz) plane with a slight camber.
function featherGeometry(len: number, width: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        0, 0, 0, // root
        len * 0.5, 0.015, width, // leading mid
        len, 0.0, width * 0.15, // tip
        len * 0.5, 0.015, -width, // trailing mid
      ],
      3,
    ),
  );
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/**
 * One wing as a shoulder-pivot group (flap by setting `.rotation.z`).
 * @param side +1 right, -1 left (mirrored across x)
 */
export function makeWing(
  side: 1 | -1,
  color: THREE.ColorRepresentation,
  tipColor: THREE.ColorRepresentation,
  span = 0.5,
): Wing {
  const N = 7;
  const base = new THREE.Color(color);
  const tip = new THREE.Color(tipColor);
  const geos: THREE.BufferGeometry[] = [];

  for (let k = 0; k < N; k++) {
    const t = k / (N - 1);
    const len = span * (0.55 + t * 0.7);
    const width = span * 0.14 * (1 - t * 0.25);
    const g = featherGeometry(len, width);
    // fan the feathers out along the arm and sweep the outer ones back
    const sweep = 0.12 + t * 1.05;
    const armX = span * (0.08 + t * 0.5);
    g.applyMatrix4(
      new THREE.Matrix4().multiplyMatrices(
        new THREE.Matrix4().makeTranslation(armX, 0, 0),
        new THREE.Matrix4().makeRotationY(sweep),
      ),
    );
    const col = base.clone().lerp(tip, t > 0.5 ? (t - 0.5) * 1.5 : 0);
    const n = g.getAttribute("position").count;
    const carr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) carr.set([col.r, col.g, col.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(carr, 3));
    geos.push(g);
  }

  const merged = mergeGeometries(geos, false);
  if (side < 0) {
    const p = merged.getAttribute("position");
    for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i));
  }
  merged.computeVertexNormals();

  const mesh = new THREE.Mesh(
    merged,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0,
      side: THREE.DoubleSide,
      flatShading: true,
    }),
  );
  mesh.castShadow = true;

  const shoulder = new THREE.Group();
  shoulder.add(mesh);
  return shoulder;
}

/**
 * Symmetric flap angle (tips rise/fall together). Real birds flap in BURSTS then
 * GLIDE with wings held out, so we envelope the beat: flap ~60% of a slow cycle,
 * then hold the wings spread for the glide. Perched = folded & still.
 */
export function flapAngle(t: number, phase: number, flying: boolean, hz = 12): number {
  if (!flying) return -0.3 + Math.sin(t * 2.2 + phase) * 0.04;
  const cyc = (t * 0.5 + phase) % 1.0;
  const flapAmt = cyc < 0.6 ? 1 : Math.max(0, 1 - (cyc - 0.6) / 0.4); // flap, then glide
  const amp = 0.72 * flapAmt + 0.05;
  const base = 0.18 + (1 - flapAmt) * 0.24; // wings held higher/spread while gliding
  return base + Math.sin(t * hz + phase) * amp;
}
