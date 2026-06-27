"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MAX_HOUSES } from "@/lib/layout";
import { sampleBranchAnchors } from "@/lib/branches";
import { buildLantern, LANTERN_SIZE } from "@/lib/lantern";
import { TIER_SIZE, resolveTier } from "@/lib/rarity";
import type { Stargazer } from "@/lib/stargazers";

const BRIDGE = "/models/suspension_bridge.glb";
const LANTERN = "/models/stylized_lantern.glb";
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const DECK = 0.35; // platform deck top above the raw branch anchor (matches Houses)
const WALKWAY_RAISE = 0.24; // extra clearance so bridges visibly sit above branches
const TRUNK_R = 1.85; // prefer spans that do not cut through the central trunk
const LADDER_W = 0.85;
const LADDER_CROSS = 0.46; // built ladder's widest extent (for cross-scaling)
// Bridges are the DEFAULT: a flat plank bridge is a walkable ramp, so it can also
// climb. A ladder is ONLY used when the link is essentially "straight up" — the two
// decks are nearly stacked (tiny horizontal run) with a real height difference, so
// no bridge ramp could lie between them.
const MAX_BRIDGE_GAP = 13.5; // longest walkable plank span (edge-to-edge)
const MAX_BRIDGE_DH = 9; // a ramp bridge may climb this much…
const MAX_BRIDGE_SLOPE = 1.5; // …as long as it stays gentler than ~56° (rise/run)
const LADDER_MIN_DH = 1.0; // below this rise nothing needs a ladder
const LADDER_MAX_RUN = 2.6; // ladder only when decks are this close horizontally
const MAX_LADDER_HD = 11;

const WOOD_NOISE = /* glsl */ `
  float whash(vec3 p){ return fract(sin(dot(p, vec3(17.17, 41.93, 9.71))) * 43758.5453); }
  float wnoise(vec3 p){
    vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(whash(i),whash(i+vec3(1,0,0)),f.x),
                   mix(whash(i+vec3(0,1,0)),whash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(whash(i+vec3(0,0,1)),whash(i+vec3(1,0,1)),f.x),
                   mix(whash(i+vec3(0,1,1)),whash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
`;

function applyWoodShader(mat: THREE.Material) {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return mat;
  mat.color.set("#8a572f");
  mat.roughness = 0.86;
  mat.metalness = 0;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying vec3 vWoodPos;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n vWoodPos = position;",
      );
    shader.fragmentShader =
      "varying vec3 vWoodPos;\n" +
      WOOD_NOISE +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float grain = wnoise(vec3(vWoodPos.x * 3.0, vWoodPos.y * 8.0, vWoodPos.z * 18.0));
        float lines = smoothstep(0.38, 0.92, sin(vWoodPos.x * 10.0 + grain * 3.0) * 0.5 + 0.5);
        vec3 warm = vec3(0.55, 0.33, 0.16);
        vec3 honey = vec3(0.78, 0.50, 0.24);
        vec3 deep = vec3(0.26, 0.14, 0.07);
        vec3 wood = mix(warm, honey, grain * 0.7);
        wood = mix(wood, deep, lines * 0.34);
        diffuseColor.rgb = mix(diffuseColor.rgb, wood, 0.9);`,
      );
  };
  mat.needsUpdate = true;
  return mat;
}

// A simple, sturdy wooden ladder built in code: two rails + rungs, height 1,
// centred at the origin with its long axis on Y (so it can be stretched to span
// any climb). No external asset needed.
const LADDER_WOOD = applyWoodShader(
  new THREE.MeshStandardMaterial({
    color: "#8a572f",
    roughness: 0.86,
  }),
);
function makeLadder(): THREE.Group {
  const g = new THREE.Group();
  const railGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 6); // y: -0.5..0.5
  for (const x of [-0.2, 0.2]) {
    const rail = new THREE.Mesh(railGeo, LADDER_WOOD);
    rail.position.x = x;
    rail.castShadow = true;
    g.add(rail);
  }
  const rungGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.46, 6);
  const N = 7;
  for (let i = 0; i < N; i++) {
    const rung = new THREE.Mesh(rungGeo, LADDER_WOOD);
    rung.rotation.z = Math.PI / 2;
    rung.position.y = -0.42 + (i / (N - 1)) * 0.84;
    rung.castShadow = true;
    g.add(rung);
  }
  return g;
}

// A STRAIGHT, flat plank walkway (no sag) built to the exact span length, so it
// reads as a real, walkable bridge between two decks. Merged → one draw call.
function makeFlatBridge(length: number): THREE.BufferGeometry {
  const W = 0.64; // walkway width
  const L = Math.max(0.4, length);
  const geos: THREE.BufferGeometry[] = [];
  geos.push(new THREE.BoxGeometry(L, 0.06, W)); // deck slab
  const nPlanks = Math.max(4, Math.round(L / 0.3));
  for (let i = 0; i < nPlanks; i++) {
    const px = -L / 2 + ((i + 0.5) / nPlanks) * L;
    const pl = new THREE.BoxGeometry(0.17, 0.09, W * 0.96);
    pl.translate(px, 0.02, 0);
    geos.push(pl);
  }
  for (const s of [-1, 1]) {
    const rail = new THREE.BoxGeometry(L, 0.05, 0.05);
    rail.translate(0, 0.46, s * (W / 2 - 0.04));
    geos.push(rail);
    const nP = Math.max(2, Math.round(L / 0.75));
    for (let i = 0; i <= nP; i++) {
      const px = -L / 2 + (i / nP) * L;
      const post = new THREE.BoxGeometry(0.05, 0.5, 0.05);
      post.translate(px, 0.23, s * (W / 2 - 0.04));
      geos.push(post);
    }
  }
  const merged = mergeGeometries(geos, false);
  merged.computeVertexNormals();
  return merged;
}

// Closest distance (XZ) from the trunk (origin) to segment a→b.
function segDistToTrunkXZ(a: THREE.Vector3, b: THREE.Vector3): number {
  const ax = a.x;
  const az = a.z;
  const bx = b.x - ax;
  const bz = b.z - az;
  const len2 = bx * bx + bz * bz || 1;
  let t = -(ax * bx + az * bz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + bx * t, az + bz * t);
}

type Model = {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  len: number;
  axis: THREE.Vector3;
  cross: number;
};

function extractModel(scene: THREE.Object3D): Model | null {
  let mesh: THREE.Mesh | null = null;
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh && !mesh) mesh = o;
  });
  const m = mesh as THREE.Mesh | null;
  if (!m) return null;
  const g = m.geometry.clone();
  g.computeBoundingBox();
  const c = new THREE.Vector3();
  g.boundingBox!.getCenter(c);
  g.translate(-c.x, -c.y, -c.z);
  const size = new THREE.Vector3();
  g.boundingBox!.getSize(size);
  let axis = new THREE.Vector3(1, 0, 0);
  let len = size.x;
  let cross = Math.max(size.y, size.z);
  if (size.y >= size.x && size.y >= size.z) {
    axis = new THREE.Vector3(0, 1, 0);
    len = size.y;
    cross = Math.max(size.x, size.z);
  } else if (size.z >= size.x && size.z >= size.y) {
    axis = new THREE.Vector3(0, 0, 1);
    len = size.z;
    cross = Math.max(size.x, size.y);
  }
  return {
    geo: g,
    mat: applyWoodShader((m.material as THREE.Material).clone()),
    len,
    axis,
    cross,
  };
}

// Platform-to-platform walkways: a minimum spanning tree connects every deck.
// Gentle gaps → a suspension bridge (rim-to-rim, with a hanging sag); steep
// climbs → a ladder; overlapping decks need nothing. Each span carries a lantern.
export function Bridges({
  stars,
  night = 0,
  stargazers = null,
}: {
  stars: number;
  night?: number;
  stargazers?: Stargazer[] | null;
}) {
  const { scene: bridgeScene } = useGLTF(BRIDGE);
  const { scene: lanternScene } = useGLTF(LANTERN);
  const anchors = useMemo(() => sampleBranchAnchors(null, MAX_HOUSES), []);
  const bridge = useMemo(() => extractModel(bridgeScene), [bridgeScene]);
  // Procedural ladder: unit height, long axis Y. (len/axis/cross drive scaling.)
  const ladder = { len: 1, axis: Y_AXIS, cross: LADDER_CROSS };

  // Deck radius per house — uses the SAME resolved tier as Houses so the bridge
  // ends land exactly on the deck rims.
  const deckRadius = useMemo(
    () => (i: number) => TIER_SIZE[resolveTier(i, stargazers)] * 1.5,
    [stargazers],
  );
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const axX = useMemo(() => new THREE.Vector3(), []);
  const axZ = useMemo(() => new THREE.Vector3(), []);

  const active = Math.min(anchors.length, Math.max(0, Math.floor(stars)));

  const edges = useMemo<[number, number, boolean][]>(() => {
    const out: [number, number, boolean][] = [];
    if (active < 2) return out;

    const classify = (
      i: number,
      j: number,
    ): { cost: number; ladder: boolean; valid: boolean; hd: number } => {
      const a = anchors[i].pos;
      const b = anchors[j].pos;
      const hd = Math.hypot(b.x - a.x, b.z - a.z);
      const gap = Math.max(0, hd - deckRadius(i) - deckRadius(j));
      const dh = Math.abs(a.y - b.y);
      const run = Math.max(0.001, gap); // horizontal room a plank ramp has to lie in
      const slope = dh / run; // rise / run of a would-be ramp bridge
      const crossesTrunk = segDistToTrunkXZ(a, b) < TRUNK_R;
      // PREFER a walkable plank BRIDGE wherever one can span (it ramps up gently as
      // needed). Only when two decks are nearly stacked — a real rise with almost no
      // horizontal room — is it "straight up", and THAT gets a ladder.
      const canBridge =
        gap > 0.35 && gap <= MAX_BRIDGE_GAP && dh <= MAX_BRIDGE_DH && slope <= MAX_BRIDGE_SLOPE;
      const canLadder = dh > LADDER_MIN_DH && run <= LADDER_MAX_RUN && hd <= MAX_LADDER_HD;
      // The bridge wins ties — a ladder is the fallback only when no bridge fits.
      const useLadder = canLadder && !canBridge;
      const valid = (canBridge || canLadder) && !crossesTrunk;

      if (!valid) {
        return {
          cost: gap + dh * 1.8 + (crossesTrunk ? 7 : 0) + 12,
          ladder: useLadder || dh > LADDER_MIN_DH,
          valid: false,
          hd,
        };
      }
      return {
        // bias the spanning tree toward bridges; ladders carry a fixed surcharge so
        // they're only chosen where a bridge genuinely cannot reach.
        cost: gap + dh * 0.9 + (useLadder ? 4 : 0) + (crossesTrunk ? 6 : 0),
        ladder: useLadder,
        valid,
        hd,
      };
    };

    // 1) MST backbone so every deck is reachable (too-close decks get skipped and
    //    the spanning tree reaches the next reachable platform instead).
    const inTree = new Array(active).fill(false);
    const best = new Array(active).fill(Infinity);
    const parent = new Array(active).fill(0);
    const ladderToParent = new Array(active).fill(false);
    inTree[0] = true;
    for (let j = 1; j < active; j++) {
      const c = classify(0, j);
      best[j] = c.cost;
      ladderToParent[j] = c.ladder;
    }
    for (let k = 1; k < active; k++) {
      let pick = -1;
      let pickD = Infinity;
      for (let j = 0; j < active; j++) {
        if (!inTree[j] && best[j] < pickD) {
          pickD = best[j];
          pick = j;
        }
      }
      if (pick < 0) break;
      inTree[pick] = true;
      out.push([parent[pick], pick, ladderToParent[pick]]);
      for (let j = 0; j < active; j++) {
        if (inTree[j]) continue;
        const c = classify(pick, j);
        if (c.cost < best[j]) {
          best[j] = c.cost;
          parent[j] = pick;
          ladderToParent[j] = c.ladder;
        }
      }
    }

    // 2) Net: also link each deck to its nearest VALID neighbours (walkable
    //    bridges/ladders, never through the trunk), so it reads as a web, not a
    //    single chain. Deduped against the MST.
    const has = new Set(out.map(([i, j]) => (i < j ? `${i}-${j}` : `${j}-${i}`)));
    for (let i = 0; i < active; i++) {
      const cands: { j: number; hd: number; ladder: boolean }[] = [];
      for (let j = 0; j < active; j++) {
        if (i === j) continue;
        const c = classify(i, j);
        if (c.valid) cands.push({ j, hd: c.hd, ladder: c.ladder });
      }
      cands.sort((a, b) => a.hd - b.hd);
      let added = 0;
      for (const cand of cands) {
        if (added >= 2) break;
        const key = i < cand.j ? `${i}-${cand.j}` : `${cand.j}-${i}`;
        added++;
        if (has.has(key)) continue;
        has.add(key);
        out.push([i, cand.j, cand.ladder]);
      }
    }
    return out;
  }, [active, anchors, deckRadius]);

  // A flat plank bridge geometry sized to each (non-ladder) span, so it's a
  // straight, walkable deck (no sag). Ladders keep their procedural model.
  const bridgeGeos = useMemo(
    () =>
      edges.map(([i, j, isLadder]) => {
        if (isLadder) return null;
        const a = anchors[i].pos;
        const b = anchors[j].pos;
        const dh = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        const inset = (deckRadius(i) + deckRadius(j)) * 0.82;
        const ay = a.y + DECK + WALKWAY_RAISE;
        const by = b.y + DECK + WALKWAY_RAISE;
        const span = Math.hypot(Math.max(0.4, dh - inset), by - ay);
        return makeFlatBridge(span);
      }),
    [edges, anchors, deckRadius],
  );

  const refs = useRef<(THREE.Group | null)[]>([]);
  const lanternRefs = useRef<(THREE.Group | null)[]>([]);
  const a3 = useMemo(() => new THREE.Vector3(), []);
  const b3 = useMemo(() => new THREE.Vector3(), []);
  const mid = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const dirH = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    edges.forEach(([i, j, isLadder], k) => {
      const g = refs.current[k];
      const lg = lanternRefs.current[k];
      if (!g) return;

      if (isLadder && ladder) {
        const lo = anchors[i].pos.y <= anchors[j].pos.y ? i : j;
        const hi = lo === i ? j : i;
        const loP = anchors[lo].pos;
        const hiP = anchors[hi].pos;
        dirH.set(hiP.x - loP.x, 0, hiP.z - loP.z);
        const hd = dirH.length() || 1;
        dirH.normalize();
        const sep = hd - deckRadius(lo) - deckRadius(hi);
        a3.set(
          loP.x + dirH.x * deckRadius(lo) * 0.86,
          loP.y + DECK + WALKWAY_RAISE,
          loP.z + dirH.z * deckRadius(lo) * 0.86,
        );
        if (sep > 0.2) {
          b3.set(
            hiP.x - dirH.x * deckRadius(hi) * 0.86,
            hiP.y + DECK + WALKWAY_RAISE,
            hiP.z - dirH.z * deckRadius(hi) * 0.86,
          );
        } else {
          b3.set(
            a3.x + dirH.x * 0.3,
            hiP.y + DECK + WALKWAY_RAISE,
            a3.z + dirH.z * 0.3,
          );
        }
        mid.copy(a3).add(b3).multiplyScalar(0.5);
        dir.copy(b3).sub(a3);
        const dist = dir.length() || 1;
        dir.normalize();
        g.visible = true;
        g.position.copy(mid);
        // Proper upright basis: Y = climb direction, X = horizontal rungs across
        // it, Z = the face you climb — so rungs are level and never twisted.
        axX.crossVectors(WORLD_UP, dir);
        if (axX.lengthSq() < 1e-4) axX.set(1, 0, 0);
        axX.normalize();
        axZ.crossVectors(axX, dir).normalize();
        m4.makeBasis(axX, dir, axZ);
        g.quaternion.setFromRotationMatrix(m4);
        const L = dist / ladder.len;
        const C = LADDER_W / ladder.cross;
        g.scale.set(C, L, C);
        if (lg) {
          lg.visible = true;
          lg.position.set(b3.x, b3.y + 0.05, b3.z);
          lg.rotation.z = Math.sin(t * 0.7 + k) * 0.04;
        }
        return;
      }

      if (!bridge) return;
      a3.copy(anchors[i].pos);
      a3.y += DECK + WALKWAY_RAISE;
      b3.copy(anchors[j].pos);
      b3.y += DECK + WALKWAY_RAISE;
      const hd = Math.hypot(b3.x - a3.x, b3.z - a3.z);
      const inset = deckRadius(i) + deckRadius(j);
      if (hd <= inset + 0.25) {
        g.visible = false;
        if (lg) lg.visible = false;
        return;
      }
      g.visible = true;
      if (lg) lg.visible = true;
      dirH.set(b3.x - a3.x, 0, b3.z - a3.z).normalize();
      // Land the ends slightly ONTO each deck (≈18% inside the rim) so the planks
      // rest on the wood and read as fastened, not floating at the edge.
      a3.addScaledVector(dirH, deckRadius(i) * 0.82);
      b3.addScaledVector(dirH, -deckRadius(j) * 0.82);
      mid.copy(a3).add(b3).multiplyScalar(0.5);
      dir.copy(b3).sub(a3);
      const dist = dir.length() || 1;
      dir.normalize();
      g.position.copy(mid);
      g.position.y += 0.02; // rests just above the deck surface
      // Orient as a CLEAN STRAIGHT RAMP: length along `dir`, deck width kept
      // horizontal (no banking/twist — that was the crooked look).
      axZ.crossVectors(dir, WORLD_UP);
      if (axZ.lengthSq() < 1e-4) axZ.set(0, 0, 1);
      axZ.normalize();
      axX.crossVectors(axZ, dir).normalize();
      m4.makeBasis(dir, axX, axZ);
      g.quaternion.setFromRotationMatrix(m4);
      g.scale.set(1, 1, 1); // flat bridge geometry is already built to span length
      void dist;
      if (lg) {
        // Stand it on the planks near the span start. The suspension bridge sags
        // in the middle, so placing it at the (deck-height) end keeps it from
        // floating. A tiny sway keeps it alive without reading as detached.
        lg.position.set(a3.x + dir.x * 0.7, a3.y + 0.05, a3.z + dir.z * 0.7);
        lg.rotation.z = Math.sin(t * 0.7 + k) * 0.04;
      }
    });
  });

  const lightsOn = night > 0.04;
  if (!bridge) return null;
  return (
    <group>
      {edges.map(([i, j, isLadder], k) => {
        const lantern = buildLantern(lanternScene, LANTERN_SIZE, 0, 0.2 + night * 2.2);
        return (
          <group key={`${i}-${j}`}>
            <group
              ref={(g) => {
                refs.current[k] = g;
              }}
            >
              {isLadder ? (
                <primitive object={makeLadder()} />
              ) : (
                <mesh
                  geometry={bridgeGeos[k] ?? undefined}
                  material={LADDER_WOOD}
                  castShadow
                  receiveShadow
                />
              )}
            </group>
            <group
              ref={(g) => {
                lanternRefs.current[k] = g;
              }}
            >
              <primitive object={lantern} />
              {lightsOn && k < 3 && (
                <pointLight
                  color="#ffb765"
                  position={[0, 0.4, 0]}
                  intensity={4 * night}
                  distance={3}
                  decay={2}
                />
              )}
            </group>
          </group>
        );
      })}
    </group>
  );
}

useGLTF.preload(BRIDGE);
useGLTF.preload(LANTERN);
