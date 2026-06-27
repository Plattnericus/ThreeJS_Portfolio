"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import gsap from "gsap";
import { animated, useSpring } from "@react-spring/three";
import { bonsaiNodes, makeTaperedTubeGeometry, spineAt } from "@/lib/bonsai";
import { treeHeight, trunkBaseRadius, trunkHeight } from "@/lib/growth";
import { MAX_HOUSES } from "@/lib/layout";
import { deckRadius, type Tier } from "@/lib/rarity";

const LEAVES = "/models/leaves.glb";

// Normalised, instanceable leaf clump built from the leaves.glb model: merge its
// meshes, bake a per-material brightness into vertex colours (subtle two-tone),
// centre at origin and scale to ~1 unit. Hue then comes from the seasonal leaf
// material (color * vertexColor), so it still tints with the seasons.
function useLeafClumpGeometry(): THREE.BufferGeometry {
  const { scene } = useGLTF(LEAVES);
  return useMemo(() => {
    const geos: THREE.BufferGeometry[] = [];
    const clone = scene.clone(true);
    clone.updateMatrixWorld(true);
    clone.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const matName = (o.material as THREE.Material)?.name ?? "";
      if (matName === "material") return; // drop the white stem bits — keep leaves
      const base = new THREE.BufferGeometry();
      base.setAttribute("position", (o.geometry.getAttribute("position") as THREE.BufferAttribute).clone());
      if (o.geometry.index) base.setIndex(o.geometry.index.clone());
      base.applyMatrix4(o.matrixWorld);
      // non-indexed so all clumps merge cleanly regardless of source indexing
      const g = base.index ? base.toNonIndexed() : base;
      const name = (o.material as THREE.Material)?.name ?? "";
      const v = name.includes("F07") ? 0.88 : name === "material" ? 0.96 : 1.0;
      const n = g.getAttribute("position").count;
      g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).fill(v), 3));
      geos.push(g);
    });
    const merged = mergeGeometries(geos, false);
    merged.computeBoundingBox();
    const bb = merged.boundingBox!;
    const ctr = new THREE.Vector3();
    const size = new THREE.Vector3();
    bb.getCenter(ctr);
    bb.getSize(size);
    const maxd = Math.max(size.x, size.y, size.z) || 1;
    merged.translate(-ctr.x, -ctr.y, -ctr.z);
    merged.scale(1 / maxd, 1 / maxd, 1 / maxd);
    merged.computeVertexNormals();
    return merged;
  }, [scene]);
}

type Clump = { pos: THREE.Vector3; rot: [number, number, number]; scl: number };

// One draw call per branch: all its leaf clumps as an instanced mesh (a child of
// the branch group, so it grows/sways with the branch).
function LeafClumps({
  clumps,
  geometry,
  material,
  grown,
}: {
  clumps: Clump[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  grown: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  // Set instance matrices AND the correct visibility/scale. r3f recreates the
  // instancedMesh whenever `clumps` (count) changes, so we must re-apply state
  // here — otherwise a star arriving would leave the new mesh hidden at scale 0.
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    clumps.forEach((c, i) => {
      e.set(c.rot[0], c.rot[1], c.rot[2]);
      q.setFromEuler(e);
      s.setScalar(c.scl);
      m.compose(c.pos, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = grown;
    mesh.scale.setScalar(grown ? 1 : 0.001);
  }, [clumps, grown]);

  // GSAP "unfurl": the canopy bursts open with a back-ease once the tree grows.
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    gsap.killTweensOf(mesh.scale);
    if (grown) {
      mesh.visible = true;
      gsap.fromTo(
        mesh.scale,
        { x: 0.001, y: 0.001, z: 0.001 },
        { x: 1, y: 1, z: 1, duration: 0.75, delay: 0.28, ease: "back.out(1.7)" },
      );
    } else {
      gsap.to(mesh.scale, {
        x: 0.001,
        y: 0.001,
        z: 0.001,
        duration: 0.3,
        ease: "power2.in",
        onComplete: () => {
          if (ref.current) ref.current.visible = false;
        },
      });
    }
  }, [grown]);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, clumps.length]}
      scale={0.001}
      visible={false}
    />
  );
}

const BARK = "#6b4028";
const BARK_DARK = "#352016";
const BARK_LIGHT = "#a87854";
const BLOSSOM = "#e34f92";
const BLOSSOM_LIGHT = "#ff9fc4";

// Procedural bark texture (colour + bump + roughness) baked once into a canvas —
// a real "fixed texture" with deep vertical plates, cracks and grain, so light
// catches actual relief. No external file; generated client-side, cached.
let _barkTex: { map: THREE.Texture; bump: THREE.Texture; rough: THREE.Texture } | null = null;
function getBarkTextures() {
  if (_barkTex) return _barkTex;
  const S = 512;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
  const byte = (n: number) => Math.max(0, Math.min(255, n | 0));
  const smooth = (e0: number, e1: number, x: number) => {
    const t = clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
  };
  // 3D value noise sampled on a CYLINDER (angle around the trunk) so the pattern
  // wraps seamlessly with no vertical seam — and reads as mottled/blotchy bark
  // rather than regular vertical stripes.
  const hash3 = (i: number, j: number, k: number) => {
    const x = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const vnoise3 = (x: number, y: number, z: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const xf = x - xi;
    const yf = y - yi;
    const zf = z - zi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const w = zf * zf * (3 - 2 * zf);
    const c000 = hash3(xi, yi, zi);
    const c100 = hash3(xi + 1, yi, zi);
    const c010 = hash3(xi, yi + 1, zi);
    const c110 = hash3(xi + 1, yi + 1, zi);
    const c001 = hash3(xi, yi, zi + 1);
    const c101 = hash3(xi + 1, yi, zi + 1);
    const c011 = hash3(xi, yi + 1, zi + 1);
    const c111 = hash3(xi + 1, yi + 1, zi + 1);
    return lerp(
      lerp(lerp(c000, c100, u), lerp(c010, c110, u), v),
      lerp(lerp(c001, c101, u), lerp(c011, c111, u), v),
      w,
    );
  };
  const fbm3 = (x: number, y: number, z: number) => {
    let a = 0.5;
    let s = 0;
    for (let k = 0; k < 3; k++) {
      s += a * vnoise3(x, y, z);
      x *= 2.03;
      y *= 2.03;
      z *= 2.03;
      a *= 0.5;
    }
    return s / 0.875; // normalise ~0..1
  };
  const mk = () => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    return cv;
  };
  const colCv = mk();
  const bumpCv = mk();
  const roughCv = mk();
  const cctx = colCv.getContext("2d")!;
  const bctx = bumpCv.getContext("2d")!;
  const rctx = roughCv.getContext("2d")!;
  const cI = cctx.createImageData(S, S);
  const bI = bctx.createImageData(S, S);
  const rI = rctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const fx = x / S; // up the trunk (geometry UV.x)
      const fy = y / S; // AROUND the trunk → seamless via cylinder angle
      const ang = fy * Math.PI * 2;
      const R = 1.7;
      const cx = Math.cos(ang) * R;
      const cz = Math.sin(ang) * R;
      const up = fx * 6.0;
      // domain warp (2 reused samples) → organic, non-aligned bark features
      const nA = fbm3(cx * 0.9 + 1.3, up * 0.9, cz * 0.9) - 0.5;
      const nB = fbm3(cx * 0.9 + 7.7, up * 0.9 + 5.1, cz * 0.9 + 4.4) - 0.5;
      const cxw = cx + nA * 0.7;
      const czw = cz + nB * 0.7;
      const upw = up + (nA + nB) * 0.6;
      const blotch = fbm3(cxw * 0.85, upw * 0.55, czw * 0.85); // big mottled patches
      const plate = fbm3(cxw * 1.5, upw * 1.0, czw * 1.5); // irregular bark plates
      const crackN = fbm3(cxw * 2.3, upw * 2.7, czw * 2.3);
      const ridged = 1 - Math.abs(crackN * 2 - 1);
      const crack = Math.pow(1 - ridged, 2.4); // narrow, deep, meandering fissures
      const grain = fbm3(cx * 7.5, up * 13.0, cz * 7.5); // fine grain
      const lich = smooth(0.6, 0.82, blotch); // lichen/weather patches (reuse blotch)
      // bump: plates raised, cracks recessed, grain detail
      let h = 0.46 + (plate - 0.5) * 0.5 + (blotch - 0.5) * 0.26 - crack * 0.85 + (grain - 0.5) * 0.16;
      h = clamp01(h);
      // colour: mottle between bark tones, greyish-green lichen, darkened cracks
      const tone = clamp01(blotch * 0.55 + plate * 0.45);
      let r = lerp(86, 170, tone);
      let g = lerp(56, 116, tone);
      let b = lerp(36, 74, tone);
      r = lerp(r, 150, lich * 0.45);
      g = lerp(g, 156, lich * 0.45);
      b = lerp(b, 128, lich * 0.38);
      r = lerp(r, 32, crack * 0.92);
      g = lerp(g, 23, crack * 0.92);
      b = lerp(b, 15, crack * 0.92);
      const gv = (grain - 0.5) * 22;
      const idx = (y * S + x) * 4;
      cI.data[idx] = byte(r + gv);
      cI.data[idx + 1] = byte(g + gv * 0.7);
      cI.data[idx + 2] = byte(b + gv * 0.4);
      cI.data[idx + 3] = 255;
      const hv = byte(h * 255);
      bI.data[idx] = bI.data[idx + 1] = bI.data[idx + 2] = hv;
      bI.data[idx + 3] = 255;
      const rv = byte(clamp01(0.74 + crack * 0.26 - (plate - 0.5) * 0.12) * 255);
      rI.data[idx] = rI.data[idx + 1] = rI.data[idx + 2] = rv;
      rI.data[idx + 3] = 255;
    }
  }
  cctx.putImageData(cI, 0, 0);
  bctx.putImageData(bI, 0, 0);
  rctx.putImageData(rI, 0, 0);
  const map = new THREE.CanvasTexture(colCv);
  const bump = new THREE.CanvasTexture(bumpCv);
  const rough = new THREE.CanvasTexture(roughCv);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, bump, rough]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 1); // 3 tiles up the trunk, one seamless wrap around
    t.anisotropy = 8;
  }
  _barkTex = { map, bump, rough };
  return _barkTex;
}

function makeBarkMaterial(_color = BARK) {
  const { map, bump, rough } = getBarkTextures();
  return new THREE.MeshStandardMaterial({
    color: 0xffffff, // the texture carries the colour
    map,
    bumpMap: bump,
    bumpScale: 1.7,
    roughnessMap: rough,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide, // never let a trunk side cull/show-through
  });
}

// Cut-branch cap: concentric annual rings on the sawn face. Uses the disc's own
// local XY radius, so one shared material works for every stub. Slightly wobbled
// so the rings aren't perfect circles, with a darker heartwood centre.
function makeRingCapMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: "#caa46a",
    roughness: 0.82,
    metalness: 0,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying vec2 vCap;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n vCap = position.xy;",
      );
    shader.fragmentShader =
      "varying vec2 vCap;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float rad = length(vCap);
        float ang = atan(vCap.y, vCap.x);
        float wob = sin(ang * 7.0) * 0.004 + sin(ang * 3.0 + 1.2) * 0.006;
        float rings = sin((rad + wob) * 120.0) * 0.5 + 0.5;
        vec3 lightw = vec3(0.80, 0.64, 0.40);
        vec3 darkw = vec3(0.45, 0.31, 0.16);
        vec3 woodc = mix(darkw, lightw, rings);
        woodc *= mix(0.78, 1.0, smoothstep(0.0, 0.04, rad)); // darker heartwood core
        diffuseColor.rgb = woodc;`,
      );
  };
  return mat;
}

// Leaf material with a per-instance wind sway baked into the vertex shader, so
// the whole instanced canopy ripples in one draw call. Seasonal tint still comes
// from `.color` (× vertexColor); `uWind` is the live wind value.
function makeLeafMaterial(
  color: THREE.ColorRepresentation,
  uniforms: { uTime: { value: number }; uWind: { value: number } },
) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.78,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = uniforms.uWind;
    shader.vertexShader =
      "uniform float uTime;\nuniform float uWind;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.6;
        #else
          float ph = position.x * 0.6;
        #endif
        float hf = 0.35 + max(transformed.y, 0.0) * 0.6;
        // constant downwind lean (scales with wind speed) + gusty flutter
        transformed.x += uWind * 0.06 * hf;
        transformed.x += (sin(uTime * 1.7 + ph) * 0.07 + sin(uTime * 3.6 + ph * 1.7) * 0.035) * uWind * hf;
        transformed.z += (cos(uTime * 1.4 + ph) * 0.06) * uWind * hf;
        transformed.y += sin(uTime * 2.2 + ph * 1.3) * 0.025 * uWind * hf;
        `,
      );
  };
  return mat;
}

function makeLeafGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.08);
  shape.bezierCurveTo(0.24, 0.06, 0.2, 0.48, 0, 0.62);
  shape.bezierCurveTo(-0.2, 0.48, -0.24, 0.06, 0, -0.08);
  const geo = new THREE.ShapeGeometry(shape, 5);
  geo.rotateX(-Math.PI * 0.44);
  geo.computeVertexNormals();
  return geo;
}

function makeBlossomGeometry() {
  const geo = new THREE.IcosahedronGeometry(0.16, 1);
  geo.scale(1, 0.76, 1);
  return geo;
}

// A tiny CLUSTER of leaves (the instanced unit hung along the twigs). A few flat
// leaves fanned + drooping around a base, merged into one small geometry (~6 leaf
// cards). Instancing thousands of these = a dense, real-tree canopy for cheap.
// vertexColors carry a subtle per-leaf two-tone (× the seasonal leaf colour).
function makeLeafSprigGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.05);
  shape.bezierCurveTo(0.15, 0.03, 0.12, 0.3, 0, 0.4);
  shape.bezierCurveTo(-0.12, 0.3, -0.15, 0.03, 0, -0.05);
  const geos: THREE.BufferGeometry[] = [];
  const N = 6;
  for (let i = 0; i < N; i++) {
    const g = new THREE.ShapeGeometry(shape, 3);
    g.rotateX(-0.5 - (i % 3) * 0.22); // tilt + droop
    g.rotateY(i * 2.39996 + 0.5); // golden-angle fan
    g.translate(0, 0.24, 0); // tuft sits at the top of the little twig
    const cnt = g.getAttribute("position").count;
    const shade = 0.78 + (i % 3) * 0.08; // subtle two-tone
    g.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(cnt * 3).fill(shade), 3),
    );
    geos.push(g);
  }
  return mergeGeometries(geos, false);
}

function makePlanterGeometry() {
  const g = new THREE.Group();
  const ceramic = new THREE.MeshStandardMaterial({
    color: "#e7dfd3",
    roughness: 0.76,
  });
  const ceramicDark = new THREE.MeshStandardMaterial({
    color: "#b8ac9c",
    roughness: 0.82,
  });
  const moss = new THREE.MeshStandardMaterial({
    color: "#52683d",
    roughness: 0.95,
  });
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(2.8, 2.42, 0.68, 64, 1, true),
    ceramic,
  );
  bowl.position.y = -0.4;
  bowl.castShadow = true;
  bowl.receiveShadow = true;
  g.add(bowl);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.13, 10, 64), ceramic);
  rim.position.y = -0.05;
  rim.rotation.x = Math.PI / 2;
  rim.castShadow = true;
  g.add(rim);

  const foot = new THREE.Mesh(
    new THREE.CylinderGeometry(2.16, 2.22, 0.18, 48),
    ceramicDark,
  );
  foot.position.y = -0.82;
  foot.castShadow = true;
  g.add(foot);

  const soil = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.38, 0.1, 48), moss);
  soil.position.y = -0.06;
  soil.receiveShadow = true;
  g.add(soil);
  return g;
}

function BranchCluster({
  node,
  leafGeometry,
  blossomGeometry,
  leafMaterial,
  blossomMaterial,
  blossomLightMaterial,
}: {
  node: ReturnType<typeof bonsaiNodes>[number];
  leafGeometry: THREE.BufferGeometry;
  blossomGeometry: THREE.BufferGeometry;
  leafMaterial: THREE.Material;
  blossomMaterial: THREE.Material;
  blossomLightMaterial: THREE.Material;
}) {
  const items = useMemo(() => {
    const out: {
      pos: [number, number, number];
      rot: [number, number, number];
      scale: [number, number, number];
      blossom: boolean;
      light: boolean;
    }[] = [];
    const count = 24 + (node.index % 5) * 3;
    for (let i = 0; i < count; i++) {
      const a = node.phase + i * 2.399;
      const r = 0.34 + ((i * 37) % 100) / 100 * 1.05;
      const y = Math.sin(i * 1.7 + node.phase) * 0.54;
      out.push({
        pos: [
          Math.cos(a) * r,
          y,
          Math.sin(a) * r * 0.72,
        ],
        rot: [
          Math.sin(a) * 0.35,
          -a + Math.PI * 0.5,
          Math.cos(a * 1.3) * 0.45,
        ],
        scale: [
          0.72 + ((i * 13) % 8) * 0.045,
          0.72 + ((i * 7) % 8) * 0.045,
          0.72,
        ],
        blossom: i % 4 !== 0,
        light: i % 5 === 0,
      });
    }
    return out;
  }, [node]);

  return (
    <group position={node.tip}>
      {items.map((item, i) =>
        item.blossom ? (
          <mesh
            key={`b-${i}`}
            geometry={blossomGeometry}
            material={item.light ? blossomLightMaterial : blossomMaterial}
            position={item.pos}
            rotation={item.rot}
            scale={item.scale}
            castShadow
          />
        ) : (
          <mesh
            key={`l-${i}`}
            geometry={leafGeometry}
            material={leafMaterial}
            position={item.pos}
            rotation={item.rot}
            scale={item.scale}
            castShadow
          />
        ),
      )}
    </group>
  );
}

export function Tree({
  stars,
  wind = 1,
  leafColor = "#5aa238",
  snow = 0,
  stargazers = null,
  children,
  ...props
}: {
  stars: number;
  wind?: number;
  leafColor?: string;
  snow?: number;
  stargazers?: { tier?: Tier }[] | null;
} & ThreeElements["group"]) {
  const swayRef = useRef<THREE.Group>(null);
  const trunkRef = useRef<THREE.Group>(null);
  const branchRefs = useRef<(THREE.Group | null)[]>([]);
  const nodes = useMemo(() => bonsaiNodes(MAX_HOUSES), []);
  const active = Math.min(MAX_HOUSES, Math.max(0, Math.floor(stars)));
  const sprigGeo = useMemo(makeLeafSprigGeometry, []);
  // Shared wind uniforms — updated each frame; the leaf shader reads them so the
  // whole canopy ripples (procedural "physics", 1 draw call).
  const windUniforms = useRef({ uTime: { value: 0 }, uWind: { value: 1 } });

  const materials = useMemo(
    () => ({
      bark: makeBarkMaterial(BARK),
      barkDark: makeBarkMaterial(BARK_DARK),
      barkLight: makeBarkMaterial(BARK_LIGHT),
      ringCap: makeRingCapMaterial(),
      leaf: makeLeafMaterial(leafColor, windUniforms.current),
      blossom: new THREE.MeshStandardMaterial({
        color: BLOSSOM,
        roughness: 0.72,
      }),
      blossomLight: new THREE.MeshStandardMaterial({
        color: BLOSSOM_LIGHT,
        roughness: 0.68,
      }),
    }),
    [],
  );

  useEffect(() => {
    materials.leaf.color
      .set(leafColor)
      .lerp(new THREE.Color("#ffffff"), Math.min(1, snow * 0.55));
    materials.blossom.color
      .set(BLOSSOM)
      .lerp(new THREE.Color("#ffffff"), Math.min(1, snow * 0.35));
    materials.blossomLight.color
      .set(BLOSSOM_LIGHT)
      .lerp(new THREE.Color("#ffffff"), Math.min(1, snow * 0.4));
  }, [materials, leafColor, snow]);

  // The trunk is now a TALL spine sampled from the ground to the top active
  // platform (+ crown margin). It thickens with height but stays thinner than the
  // helix radius (5.2) so it never pokes through a platform. Regenerates as the
  // tower grows.
  const trunkH = trunkHeight(stars); // trunk tip ends inside the crown
  const trunkR = trunkBaseRadius(stars); // thin, clean trunk
  const trunkPieces = useMemo(() => {
    const H = trunkH;
    const baseR = trunkR;
    const segs = THREE.MathUtils.clamp(Math.round(H * 2), 24, 220);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segs; i++) pts.push(spineAt((i / segs) * H));
    return [
      {
        key: "trunk",
        geometry: makeTaperedTubeGeometry(pts, baseR, baseR * 0.24, segs, 18, 0.5, 0.7),
        material: materials.bark,
      },
    ];
  }, [materials, trunkH, trunkR]);

  const rootPieces = useMemo(() => {
    const baseR = trunkR;
    const spread = 1 + baseR * 1.3;
    return Array.from({ length: 10 }, (_, i) => {
      const a = i * 0.628 + 0.2;
      const p0 = spineAt(0).add(
        new THREE.Vector3(Math.cos(a) * baseR * 0.5, -0.03, Math.sin(a) * baseR * 0.5),
      );
      const p1 = new THREE.Vector3(Math.cos(a) * spread * 0.6, -0.12, Math.sin(a) * spread * 0.6);
      const p2 = new THREE.Vector3(
        Math.cos(a) * (spread + (i % 3) * 0.18),
        -0.2,
        Math.sin(a) * (spread * 0.78 + (i % 2) * 0.14),
      );
      return {
        key: `root-${i}`,
        geometry: makeTaperedTubeGeometry([p0, p1, p2], baseR * 0.35, 0.06, 18, 7, i * 0.7),
      };
    });
  }, [trunkH, trunkR]);

  // A few old, sawn-off branch stubs jutting from the trunk — each a short tapered
  // limb capped with an annual-ring disc (the cut face). Deterministic detail that
  // breaks up the "perfect pipe" silhouette.
  const trunkStubPieces = useMemo(() => {
    const H = trunkH;
    const baseR = trunkR;
    const specs = [
      { y: 1.4, ang: 0.6, len: 0.6, r: 0.22, up: 0.3 },
      { y: 2.4, ang: 3.7, len: 0.42, r: 0.16, up: 0.36 },
      { y: 3.4, ang: 2.3, len: 0.5, r: 0.18, up: 0.42 },
      { y: 4.6, ang: 4.5, len: 0.4, r: 0.15, up: 0.5 },
      { y: 6.0, ang: 1.3, len: 0.36, r: 0.13, up: 0.54 },
      { y: 7.6, ang: 5.6, len: 0.32, r: 0.12, up: 0.6 },
    ].filter((s) => s.y < H - 0.5);
    const trunkRadiusAt = (y: number) =>
      Math.max(0.12, baseR * Math.pow(1 - THREE.MathUtils.clamp(y / H, 0, 1), 0.72));
    return specs.map((s, i) => {
      const center = spineAt(s.y);
      const radial = new THREE.Vector3(Math.cos(s.ang), 0, Math.sin(s.ang));
      const dir = radial.clone().add(new THREE.Vector3(0, s.up, 0)).normalize();
      const rT = trunkRadiusAt(s.y);
      const base = center.clone().addScaledVector(radial, rT * 0.5);
      const mid = center.clone().addScaledVector(dir, rT * 0.8 + s.len * 0.45);
      const tip = center.clone().addScaledVector(dir, rT * 0.85 + s.len);
      const rEnd = s.r * 0.82;
      const side = makeTaperedTubeGeometry([base, mid, tip], s.r, rEnd, 10, 9, i * 0.7);
      const cap = new THREE.CircleGeometry(rEnd * 1.05, 18);
      const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        dir,
      );
      const capPos = tip.clone().addScaledVector(dir, 0.004);
      return {
        key: `stub-${i}`,
        side,
        cap,
        capPos: [capPos.x, capPos.y, capPos.z] as [number, number, number],
        capQuat: [quat.x, quat.y, quat.z, quat.w] as [number, number, number, number],
      };
    });
  }, [trunkH, trunkR]);

  const branchPieces = useMemo(() => {
    return nodes.map((node) => {
      const branchGeo = makeTaperedTubeGeometry(
        [
          node.base.clone().sub(node.base),
          node.elbow.clone().sub(node.base),
          node.tip.clone().sub(node.base),
        ],
        node.radius,
        node.radius * 0.22,
        24,
        8,
        node.phase,
      );
      return { node, branchGeo };
    });
  }, [nodes]);

  const leafGeometry = useMemo(makeLeafGeometry, []);
  const blossomGeometry = useMemo(makeBlossomGeometry, []);
  const planter = useMemo(makePlanterGeometry, []);

  // Crown extent (mirrors the canopy fill below) — used to size a cheap shadow
  // proxy so the dense canopy itself can stay out of the shadow passes.
  const crownBounds = useMemo(() => {
    let maxReach = 3.6;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < active; i++) {
      const t = nodes[i].tip;
      maxReach = Math.max(maxReach, Math.hypot(t.x, t.z) + deckRadius(i, stargazers));
      minY = Math.min(minY, t.y);
      maxY = Math.max(maxY, t.y);
    }
    if (!isFinite(minY)) {
      minY = 7.5;
      maxY = 8.5;
    }
    return {
      cy: (minY + maxY) / 2 + 0.6,
      rx: maxReach + 1.8,
      ry: (maxY - minY) / 2 + 2.8,
    };
  }, [active, nodes, stargazers]);

  // The whole crown as one collision-aware cloud of leaf clumps. Foliage sits on
  // EVERY branch node (so the crown is full from the first star — its small size
  // comes from the tree's scale, not from missing leaves), but is carved away
  // wherever an ACTIVE house deck or a bridge between two decks would be, so
  // leaves never poke through houses/walkways.
  const crownStructure = useMemo(() => {
    const decks = Array.from({ length: active }, (_, i) => {
      const r = deckRadius(i, stargazers);
      // tier-aware clearance height: deck + building + roof (r/1.5 == tier size).
      return { c: nodes[i].tip, r, top: 0.35 + (r / 1.5) * 1.9 };
    });
    // a clump is "blocked" if it sits in a deck disc, or over a bridge segment
    // between two nearby active decks, within the walkway height band.
    const blocked = (p: THREE.Vector3, scl: number) => {
      const pad = 0.35 + scl * 0.22;
      for (const d of decks) {
        const dx = p.x - d.c.x;
        const dz = p.z - d.c.z;
        // clear a full-height column around each house — from just under the deck
        // up past the roof (tier-aware) — padded by the clump's own radius so big
        // clumps never poke in from the side or hang down onto the roof.
        if (
          dx * dx + dz * dz < (d.r + pad) * (d.r + pad) &&
          p.y > d.c.y - 0.5 - scl * 0.3 &&
          p.y < d.c.y + d.top + scl * 0.45
        )
          return true;
      }
      for (let i = 0; i < decks.length; i++) {
        for (let j = i + 1; j < decks.length; j++) {
          const a = decks[i].c;
          const b = decks[j].c;
          const gap = Math.hypot(b.x - a.x, b.z - a.z) - decks[i].r - decks[j].r;
          if (gap < 0.4 || gap > 6) continue; // only real bridge spans
          const abx = b.x - a.x;
          const abz = b.z - a.z;
          const t = THREE.MathUtils.clamp(
            ((p.x - a.x) * abx + (p.z - a.z) * abz) / (abx * abx + abz * abz),
            0,
            1,
          );
          const cx = a.x + abx * t;
          const cz = a.z + abz * t;
          const cy = a.y + (b.y - a.y) * t + 0.5; // walkway sits above the anchors
          const rr = 1.0 + scl * 0.45; // corridor half-width incl. the clump radius
          if ((p.x - cx) ** 2 + (p.z - cz) ** 2 < rr * rr && Math.abs(p.y - cy) < 1.2 + scl * 0.3)
            return true;
        }
      }
      return false;
    };

    // The crown is a rounded, organic mass that CAPS the trunk tip and wraps the
    // platforms: foliage from just below the lowest platform up to an apex ABOVE
    // the trunk (so the trunk never pokes out bare), fullest toward the top.
    let lowPlatY = Infinity;
    let maxReach = 3.2;
    for (let i = 0; i < active; i++) {
      const t = nodes[i].tip;
      maxReach = Math.max(maxReach, Math.hypot(t.x, t.z) + deckRadius(i, stargazers));
      lowPlatY = Math.min(lowPlatY, nodes[i].base.y);
    }
    if (!isFinite(lowPlatY)) lowPlatY = 2;
    const trunkTopY = trunkHeight(stars); // the trunk tip the crown must cap
    const apexY = treeHeight(stars); // crown apex, ABOVE the tip
    const cBot = Math.max(1.0, lowPlatY - 0.8); // foliage starts just below lowest deck
    const cRX = maxReach + 1.0; // horizontal foliage radius (wraps the platforms)
    const span = Math.max(2, apexY - cBot);
    const GA = Math.PI * (3 - Math.sqrt(5));

    // === Recursive crown: branches that FORK again and again, like a real tree.
    // Primaries spray off the upper trunk; every segment splits 2–3 ways down to
    // fine twigs, with dense leaf tufts on the outer twigs. Carved off the houses.
    const branchGeos: THREE.BufferGeometry[] = [];
    const sprigs: Clump[] = [];
    let seed = 7;
    const rnd = () => {
      seed += 1;
      const x = Math.sin(seed * 91.7 + 13.1) * 43758.5453;
      return x - Math.floor(x);
    };
    const UP = new THREE.Vector3(0, 1, 0);
    // a child direction: the parent dir rotated by `spread` about a random axis
    // perpendicular to it, with a gentle upward reach toward the light.
    const childDir = (dir: THREE.Vector3, spread: number) => {
      const ref = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP;
      const p1 = new THREE.Vector3().crossVectors(dir, ref).normalize();
      const p2 = new THREE.Vector3().crossVectors(dir, p1).normalize();
      const ang = rnd() * Math.PI * 2;
      const axis = p1
        .multiplyScalar(Math.cos(ang))
        .addScaledVector(p2, Math.sin(ang))
        .normalize();
      return dir.clone().applyAxisAngle(axis, spread).addScaledVector(UP, 0.28).normalize();
    };
    const addLeaf = (p: THREE.Vector3) => {
      const scl = 0.4 + rnd() * 0.32; // small leaves
      if (blocked(p, scl)) return; // never on a house/bridge
      sprigs.push({
        pos: p,
        rot: [rnd() * Math.PI * 2, rnd() * Math.PI * 2, rnd() * Math.PI],
        scl,
      });
    };

    let budget = THREE.MathUtils.clamp(Math.round(span * 110), 5200, 12000); // segment cap (perf)
    const grow = (
      pos: THREE.Vector3,
      dir: THREE.Vector3,
      len: number,
      rad: number,
      depth: number,
    ) => {
      if (budget-- <= 0) return;
      const end = pos.clone().addScaledVector(dir, len);
      end.y -= Math.max(0, 1 - rad * 6) * len * 0.14; // thin branches droop a little
      if (blocked(end, rad * 3 + 0.25)) return; // carve around houses/bridges
      const mid = pos.clone().addScaledVector(dir, len * 0.5);
      branchGeos.push(makeTaperedTubeGeometry([pos, mid, end], rad, rad * 0.66, 3, 4, seed * 0.7));
      // dense small-leaf tufts, thickening toward the fine outer twigs
      if (depth <= 3) addLeaf(end.clone().addScaledVector(dir, 0.08));
      if (depth <= 2)
        addLeaf(end.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.24, 0.04, (rnd() - 0.5) * 0.24)));
      if (depth <= 1) {
        addLeaf(end.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.3, -0.08, (rnd() - 0.5) * 0.3)));
        addLeaf(end.clone().addScaledVector(dir, 0.12));
      }
      if (depth <= 0 || len < 0.34) {
        addLeaf(end);
        addLeaf(end.clone().addScaledVector(dir, 0.12));
        addLeaf(end.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.2, -0.06, (rnd() - 0.5) * 0.2)));
        return; // terminal twig
      }
      const n = depth >= 3 ? (rnd() < 0.5 ? 3 : 2) : 2;
      for (let c = 0; c < n; c++) {
        // tighter spread → a tidier, less sprawly crown
        grow(end, childDir(dir, 0.3 + rnd() * 0.4), len * (0.62 + rnd() * 0.16), rad * 0.68, depth - 1);
      }
    };

    // (a) MAIN CROWN — a rounded, organic dome from just below the lowest platform
    // up to the apex, CAPPING the trunk tip. Boughs grow from the spine toward
    // shell points (golden-angle, outward-biased, jittered → rounded but not a
    // perfect ball); short segments fork into leafy twigs.
    const NC = THREE.MathUtils.clamp(Math.round(span * 4.6 + 30), 40, 320);
    for (let i = 0; i < NC; i++) {
      const v = i / Math.max(1, NC - 1); // 0 (base) .. 1 (apex)
      const ty = cBot + v * (apexY - cBot) + (rnd() - 0.5) * 0.9;
      // Envelope WIDENS with height to wrap the platforms that fan outward as the
      // tower climbs (the top platforms are the outermost — they must not stick out
      // bare), and only rounds off in the top ~15% so the apex still caps cleanly.
      const cap = Math.pow(Math.max(0, (v - 0.85) / 0.15), 2);
      const domeR = cRX * (0.5 + 0.5 * Math.min(1, v * 1.2)) * (1 - 0.5 * cap);
      const a = i * GA + rnd() * 0.5;
      const rr = 0.5 + 0.5 * Math.sqrt(rnd()); // outward bias → rounded shell
      const target = new THREE.Vector3(Math.cos(a) * domeR * rr, ty, Math.sin(a) * domeR * rr);
      if (blocked(target, 0.7)) continue; // never into a house/bridge
      const oy = THREE.MathUtils.clamp(ty - 1.0 - rnd() * 1.0, cBot - 0.5, trunkTopY);
      const sp = spineAt(oy);
      const dir = target.clone().sub(sp);
      if (dir.lengthSq() < 0.01) continue;
      dir.normalize();
      grow(sp, dir, 1.5 + rnd() * 0.5, 0.085, 5); // thin, short-segmented, leafy boughs
    }
    // (b) per-platform NEST — a dense ring of boughs hugging each platform so every
    // treehouse nestles in leaves (carved off the deck itself). The leaves wrap the
    // deck rim and rise as a leafy collar behind/around the house, so no platform —
    // not even the topmost, outermost ones — is left sitting bare.
    for (let i = 0; i < active; i++) {
      const base = nodes[i].base;
      const tip = nodes[i].tip;
      const dr = deckRadius(i, stargazers);
      const RING = 11;
      for (let k = 0; k < RING; k++) {
        const a = (k / RING) * Math.PI * 2 + i * 1.3;
        // anchor just outside the deck rim, all around it, and grow outward + up so
        // foliage forms a bowl the platform sits in (never INTO the house column).
        const o = tip
          .clone()
          .add(new THREE.Vector3(Math.cos(a) * dr * 1.04, -0.25 + rnd() * 0.3, Math.sin(a) * dr * 1.04));
        const out = new THREE.Vector3(Math.cos(a) * 0.85, 0.45 + rnd() * 0.6, Math.sin(a) * 0.85).normalize();
        grow(o, out, 1.0 + rnd() * 0.6, 0.06, 3); // short, leafy collar twigs
      }
      // a few boughs just OUTSIDE the rim reaching UP → a leafy backdrop rising
      // above the roofline (anchored clear of the deck column so they aren't carved).
      for (let k = 0; k < 4; k++) {
        const a = i * 1.3 + k * 1.7;
        const o = tip
          .clone()
          .add(new THREE.Vector3(Math.cos(a) * dr * 1.08, 0.1, Math.sin(a) * dr * 1.08));
        grow(o, new THREE.Vector3(Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35).normalize(), 1.4 + rnd() * 0.6, 0.055, 3);
      }
    }
    // (c) TIP CAP — a dense leafy knot wrapping the top of the trunk on all sides
    // so the tip is buried in leaves and never pokes out bare.
    for (let k = 0; k < 22; k++) {
      const a = k * GA + 0.3;
      const o = spineAt(trunkTopY - rnd() * 1.6); // from just below the tip up to it
      const out = new THREE.Vector3(Math.cos(a), 0.25 + rnd() * 0.7, Math.sin(a)).normalize();
      grow(o, out, 0.7 + rnd() * 0.7, 0.05, 3);
    }
    const tipBase = spineAt(trunkTopY);
    for (let k = 0; k < 26; k++) {
      addLeaf(
        tipBase
          .clone()
          .add(new THREE.Vector3((rnd() - 0.5) * 1.3, rnd() * 1.5 - 0.2, (rnd() - 0.5) * 1.3)),
      );
    }

    // (d) APEX FILL — extra leaf clumps packed straight into the TOP of the crown
    // envelope (no branch needed; leaves are one cheap instanced draw call) so the
    // upper silhouette reads as one full, rounded mass instead of wispy bare twigs
    // poking out. Fills the upper ~45% of the dome, fullest at the crown.
    const topStart = cBot + span * 0.55;
    const NF = THREE.MathUtils.clamp(Math.round(span * 30), 160, 640);
    for (let i = 0; i < NF; i++) {
      const ty = topStart + (i / Math.max(1, NF - 1)) * (apexY + 0.8 - topStart) + (rnd() - 0.5) * 0.8;
      const vv = THREE.MathUtils.clamp((ty - cBot) / span, 0, 1);
      const cap = Math.pow(Math.max(0, (vv - 0.85) / 0.15), 2);
      const domeR = cRX * (0.5 + 0.5 * Math.min(1, vv * 1.2)) * (1 - 0.5 * cap);
      const a = i * GA + rnd() * 0.6;
      const rr = Math.sqrt(rnd()); // fill the interior AND the shell evenly
      addLeaf(new THREE.Vector3(Math.cos(a) * domeR * rr, ty, Math.sin(a) * domeR * rr));
    }

    const branchGeo = branchGeos.length ? mergeGeometries(branchGeos, false) : null;
    return { branchGeo, sprigs };
  }, [nodes, active, stargazers]);

  useEffect(() => {
    branchRefs.current.forEach((group, i) => {
      if (!group) return;
      const on = i < active;
      if (on) group.visible = true;
      gsap.to(group.scale, {
        x: on ? 1 : 0.001,
        y: on ? 1 : 0.001,
        z: on ? 1 : 0.001,
        duration: on ? 0.85 : 0.35,
        delay: on ? i * 0.025 : 0,
        ease: on ? "back.out(1.35)" : "power2.in",
        onComplete: () => {
          if (!on) group.visible = false;
        },
      });
    });
  }, [active, stars]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // gusty wind: a slow-varying multiplier so it surges like real wind
    const gust = 0.7 + 0.34 * Math.sin(t * 0.45) + 0.2 * Math.sin(t * 1.7 + 1.1);
    const w = wind * gust;
    // drive the canopy leaf shader with the gusty wind
    windUniforms.current.uTime.value = t;
    windUniforms.current.uWind.value = w;
    if (!swayRef.current) return;
    // the whole crown leans DOWNWIND (more in stronger wind) and sways/whips
    const lean = Math.min(0.17, 0.025 + wind * 0.045) * gust;
    swayRef.current.rotation.z = -lean + Math.sin(t * (0.7 + wind * 0.15)) * 0.02 * wind;
    swayRef.current.rotation.x = Math.cos(t * 0.5 + 1.3) * 0.012 * wind;
    branchRefs.current.forEach((group, i) => {
      if (!group || !group.visible) return;
      group.rotation.z = Math.sin(t * (1.1 + wind * 0.22) + i * 0.7) * 0.04 * w;
      group.rotation.x = Math.cos(t * 0.8 + i) * 0.022 * w;
    });
  });

  // One-time intro pop; the tower's "growth" now reads as the trunk + crown
  // extending taller and platforms revealing — not a uniform scale (which would
  // change the fixed ~5m platform spacing).
  const { scale } = useSpring({
    from: { scale: 0.92 },
    to: { scale: 1 },
    config: { mass: 1, tension: 110, friction: 25 },
  });

  return (
    <animated.group scale={scale} {...props}>
      <primitive object={planter} />
      <group ref={swayRef}>
        <group ref={trunkRef}>
          {trunkPieces.map((piece) => (
            <mesh
              key={piece.key}
              geometry={piece.geometry}
              material={piece.material}
              castShadow
              receiveShadow
            />
          ))}
          {rootPieces.map((piece) => (
            <mesh
              key={piece.key}
              geometry={piece.geometry}
              material={materials.barkDark}
              castShadow
              receiveShadow
            />
          ))}
          {trunkStubPieces.map((s) => (
            <group key={s.key}>
              <mesh geometry={s.side} material={materials.bark} castShadow receiveShadow />
              <mesh
                geometry={s.cap}
                material={materials.ringCap}
                position={s.capPos}
                quaternion={s.capQuat}
                castShadow
              />
            </group>
          ))}
        </group>

        {branchPieces.map(({ node, branchGeo }) => (
          <group
            key={node.index}
            ref={(g) => {
              branchRefs.current[node.index] = g;
            }}
            position={node.base}
            scale={0.001}
            visible={false}
          >
            <mesh geometry={branchGeo} material={materials.bark} castShadow receiveShadow />
          </group>
        ))}

        {/* Recursive branch skeleton: forking boughs → twigs (one merged mesh). */}
        {active > 0 && crownStructure.branchGeo && (
          <mesh geometry={crownStructure.branchGeo} material={materials.bark} castShadow />
        )}

        {/* Dense leaf tufts on the outer twigs — one instanced, collision-aware,
            wind-swayed draw call. Carved clear of houses/bridges. */}
        <LeafClumps
          clumps={crownStructure.sprigs}
          geometry={sprigGeo}
          material={materials.leaf}
          grown={active > 0}
        />

        {/* Cheap invisible ellipsoid that casts the soft canopy shadow, so the
            dense leaf cloud itself never enters the (expensive) shadow pass. */}
        {active > 0 && (
          <mesh
            position={[0, crownBounds.cy, 0]}
            scale={[crownBounds.rx * 0.9, crownBounds.ry * 0.9, crownBounds.rx * 0.9]}
            castShadow
          >
            <icosahedronGeometry args={[1, 1]} />
            <meshBasicMaterial colorWrite={false} depthWrite={false} />
          </mesh>
        )}

        {children}
      </group>
    </animated.group>
  );
}

useGLTF.preload(LEAVES);
