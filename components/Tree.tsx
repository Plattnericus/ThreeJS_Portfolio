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

// Builds a normalized, tintable leaf clump from the GLB asset.
function useLeafClumpGeometry(): THREE.BufferGeometry {
  const { scene } = useGLTF(LEAVES);
  return useMemo(() => {
    const geos: THREE.BufferGeometry[] = [];
    const clone = scene.clone(true);
    clone.updateMatrixWorld(true);
    clone.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const matName = (o.material as THREE.Material)?.name ?? "";
      if (matName === "material") return;
      const base = new THREE.BufferGeometry();
      base.setAttribute("position", (o.geometry.getAttribute("position") as THREE.BufferAttribute).clone());
      if (o.geometry.index) base.setIndex(o.geometry.index.clone());
      base.applyMatrix4(o.matrixWorld);
      // Use non-indexed geometry for stable merging.
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

// Instanced leaf clumps for one canopy batch.
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
  // Re-apply matrices after r3f recreates the instanced mesh.
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

  // Animate canopy growth.
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

// Procedural bark texture generated once and cached.
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
  // Cylindrical noise keeps bark seamless around the trunk.
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
    return s / 0.875;
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
      const fx = x / S;
      const fy = y / S;
      const ang = fy * Math.PI * 2;
      const R = 1.7;
      const cx = Math.cos(ang) * R;
      const cz = Math.sin(ang) * R;
      const up = fx * 6.0;
      // Domain warp creates organic bark variation.
      const nA = fbm3(cx * 0.9 + 1.3, up * 0.9, cz * 0.9) - 0.5;
      const nB = fbm3(cx * 0.9 + 7.7, up * 0.9 + 5.1, cz * 0.9 + 4.4) - 0.5;
      const cxw = cx + nA * 0.7;
      const czw = cz + nB * 0.7;
      const upw = up + (nA + nB) * 0.6;
      const blotch = fbm3(cxw * 0.85, upw * 0.55, czw * 0.85);
      const plate = fbm3(cxw * 1.5, upw * 1.0, czw * 1.5);
      const crackN = fbm3(cxw * 2.3, upw * 2.7, czw * 2.3);
      const ridged = 1 - Math.abs(crackN * 2 - 1);
      const crack = Math.pow(1 - ridged, 2.4);
      const grain = fbm3(cx * 7.5, up * 13.0, cz * 7.5);
      const lich = smooth(0.6, 0.82, blotch);
      // Height map for bark relief.
      let h = 0.46 + (plate - 0.5) * 0.5 + (blotch - 0.5) * 0.26 - crack * 0.85 + (grain - 0.5) * 0.16;
      h = clamp01(h);
      // Color variation for bark, lichen, and cracks.
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
    t.repeat.set(3, 1);
    t.anisotropy = 8;
  }
  _barkTex = { map, bump, rough };
  return _barkTex;
}

function makeBarkMaterial(_color = BARK) {
  const { map, bump, rough } = getBarkTextures();
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map,
    bumpMap: bump,
    bumpScale: 1.7,
    roughnessMap: rough,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  });
}

// Cut-branch cap material with subtle annual rings.
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
        woodc *= mix(0.78, 1.0, smoothstep(0.0, 0.04, rad));
        diffuseColor.rgb = woodc;`,
      );
  };
  return mat;
}

// Leaf material with batched wind sway.
function makeLeafMaterial(
  color: THREE.ColorRepresentation,
  uniforms: {
    uTime: { value: number };
    uWind: { value: number };
    uWindDir: { value: THREE.Vector2 };
  },
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
    shader.uniforms.uWindDir = uniforms.uWindDir;
    shader.vertexShader =
      "uniform float uTime;\nuniform float uWind;\nuniform vec2 uWindDir;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.6;
        #else
          float ph = position.x * 0.6;
        #endif
        float hf = 0.35 + max(transformed.y, 0.0) * 0.6;
        vec2 dir = normalize(uWindDir);
        vec2 side = vec2(-dir.y, dir.x);
        float stream = ph - uTime * (0.55 + uWind * 0.08);
        float gust = 0.72 + 0.2 * sin(uTime * 0.46 + ph) + 0.08 * sin(uTime * 1.8 + ph * 0.7);
        // Downwind lean plus subtle turbulent flutter.
        float downwind = (0.035 + sin(stream * 1.35) * 0.018) * uWind * hf * gust;
        float lateral = (sin(uTime * 2.6 + ph * 1.7) * 0.018 + cos(uTime * 1.35 + ph) * 0.012) * uWind * hf;
        transformed.x += dir.x * downwind + side.x * lateral;
        transformed.z += dir.y * downwind + side.y * lateral;
        transformed.y += sin(uTime * 1.6 + ph * 1.3) * 0.014 * uWind * hf;
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

// Leaf sprig geometry used by each canopy instance.
function makeLeafSprigGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.05);
  shape.bezierCurveTo(0.15, 0.03, 0.12, 0.3, 0, 0.4);
  shape.bezierCurveTo(-0.12, 0.3, -0.15, 0.03, 0, -0.05);
  const geos: THREE.BufferGeometry[] = [];
  const N = 28;
  for (let i = 0; i < N; i++) {
    const g = new THREE.ShapeGeometry(shape, 5);
    g.scale(1.28, 1.28, 1.28);
    g.rotateX(-0.45 - (i % 5) * 0.15);
    g.rotateY(i * 2.39996 + 0.5);
    g.translate((i % 4 - 1.5) * 0.045, 0.26 + (i % 7) * 0.018, ((i * 7) % 7 - 3) * 0.032);
    const cnt = g.getAttribute("position").count;
    const shade = 0.72 + (i % 7) * 0.045;
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
  gust = 0,
  windVec = [1, 0],
  leafColor = "#5aa238",
  snow = 0,
  stargazers = null,
  children,
  ...props
}: {
  stars: number;
  wind?: number;
  gust?: number;
  windVec?: [number, number];
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
  // Shared uniforms for batched canopy motion.
  const windUniforms = useRef({
    uTime: { value: 0 },
    uWind: { value: 1 },
    uWindDir: { value: new THREE.Vector2(windVec[0], windVec[1]) },
  });

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

  // Trunk follows the procedural spine and grows with the tower.
  const trunkH = trunkHeight(stars);
  const trunkR = trunkBaseRadius(stars);
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

  // Small branch stubs break up the trunk silhouette.
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
        node.radius * 1.08,
        node.radius * 0.24,
        30,
        8,
        node.phase,
      );
      return { node, branchGeo };
    });
  }, [nodes]);

  const leafGeometry = useMemo(makeLeafGeometry, []);
  const blossomGeometry = useMemo(makeBlossomGeometry, []);
  const planter = useMemo(makePlanterGeometry, []);

  // Bounds for the cheap canopy shadow proxy.
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

  // Collision-aware canopy generated as merged branches and instanced leaves.
  const crownStructure = useMemo(() => {
    const decks = Array.from({ length: active }, (_, i) => {
      const r = deckRadius(i, stargazers);
      return { c: nodes[i].tip, r, top: 0.35 + (r / 1.5) * 1.9 };
    });
    // Keep foliage clear of decks, houses, and bridge corridors.
    const blocked = (p: THREE.Vector3, scl: number) => {
      const pad = 0.35 + scl * 0.22;
      for (const d of decks) {
        const dx = p.x - d.c.x;
        const dz = p.z - d.c.z;
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
          if (gap < 0.4 || gap > 6) continue;
          const abx = b.x - a.x;
          const abz = b.z - a.z;
          const t = THREE.MathUtils.clamp(
            ((p.x - a.x) * abx + (p.z - a.z) * abz) / (abx * abx + abz * abz),
            0,
            1,
          );
          const cx = a.x + abx * t;
          const cz = a.z + abz * t;
          const cy = a.y + (b.y - a.y) * t + 0.5;
          const rr = 1.0 + scl * 0.45;
          if ((p.x - cx) ** 2 + (p.z - cz) ** 2 < rr * rr && Math.abs(p.y - cy) < 1.2 + scl * 0.3)
            return true;
        }
      }
      return false;
    };

    // Crown bounds wrap the platforms and cover the trunk tip.
    let lowPlatY = Infinity;
    let maxReach = 3.2;
    for (let i = 0; i < active; i++) {
      const t = nodes[i].tip;
      maxReach = Math.max(maxReach, Math.hypot(t.x, t.z) + deckRadius(i, stargazers));
      lowPlatY = Math.min(lowPlatY, nodes[i].base.y);
    }
    if (!isFinite(lowPlatY)) lowPlatY = 2;
    const trunkTopY = trunkHeight(stars);
    const apexY = treeHeight(stars);
    const cBot = Math.max(1.0, lowPlatY - 0.8);
    const cRX = maxReach + 1.0;
    const span = Math.max(2, apexY - cBot);
    const GA = Math.PI * (3 - Math.sqrt(5));

    // Recursive branch system for the canopy.
    const branchGeos: THREE.BufferGeometry[] = [];
    const sprigs: Clump[] = [];
    let seed = 7;
    const rnd = () => {
      seed += 1;
      const x = Math.sin(seed * 91.7 + 13.1) * 43758.5453;
      return x - Math.floor(x);
    };
    const UP = new THREE.Vector3(0, 1, 0);
    // Rotate child branches away from the parent direction.
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
    const addLeaf = (p: THREE.Vector3, anchor?: THREE.Vector3, twigRadius = 0.018) => {
      const scl = 0.78 + rnd() * 0.54;
      if (blocked(p, scl)) return;
      if (anchor) {
        const d = p.distanceTo(anchor);
        if (d > 0.05) {
          const mid = anchor.clone().lerp(p, 0.65);
          mid.y += d * 0.08;
          branchGeos.push(
            makeTaperedTubeGeometry(
              [anchor, mid, p],
              twigRadius,
              twigRadius * 0.42,
              2,
              4,
              seed * 0.37,
            ),
          );
        }
      }
      sprigs.push({
        pos: p,
        rot: [rnd() * Math.PI * 2, rnd() * Math.PI * 2, rnd() * Math.PI],
        scl,
      });
    };
    const addLeafBurst = (
      anchor: THREE.Vector3,
      dir: THREE.Vector3,
      count: number,
      spread: number,
      twigRadius: number,
    ) => {
      for (let b = 0; b < count; b++) {
        const side = new THREE.Vector3(
          Math.cos(seed * 0.91 + b * 2.399),
          (rnd() - 0.45) * 0.7,
          Math.sin(seed * 0.91 + b * 2.399),
        )
          .addScaledVector(dir, 0.65 + rnd() * 0.55)
          .normalize();
        const p = anchor
          .clone()
          .addScaledVector(side, spread * (0.45 + rnd() * 0.7));
        addLeaf(p, anchor, twigRadius);
      }
    };

    let budget = THREE.MathUtils.clamp(Math.round(span * 100), 3200, 7600);
    const grow = (
      pos: THREE.Vector3,
      dir: THREE.Vector3,
      len: number,
      rad: number,
      depth: number,
    ) => {
      if (budget-- <= 0) return;
      const end = pos.clone().addScaledVector(dir, len);
      end.y -= Math.max(0, 1 - rad * 6) * len * 0.14;
      if (blocked(end, rad * 3 + 0.25)) return;
      const mid = pos.clone().addScaledVector(dir, len * 0.5);
      branchGeos.push(makeTaperedTubeGeometry([pos, mid, end], rad, rad * 0.66, 3, 4, seed * 0.7));
      if (depth <= 0 || len < 0.34) {
        addLeafBurst(end, dir, 10, 0.48, rad * 0.16);
        return;
      }
      // Add denser foliage on thinner outer twigs.
      if (depth <= 3) addLeafBurst(end, dir, 1, 0.18, rad * 0.22);
      if (depth <= 2) addLeafBurst(end, dir, 2, 0.26, rad * 0.2);
      if (depth <= 1) addLeafBurst(end, dir, 6, 0.4, rad * 0.18);
      const n = depth >= 3 ? (rnd() < 0.5 ? 3 : 2) : 2;
      for (let c = 0; c < n; c++) {
        grow(end, childDir(dir, 0.3 + rnd() * 0.4), len * (0.62 + rnd() * 0.16), rad * 0.68, depth - 1);
      }
    };

    // Main crown shell.
    const NC = THREE.MathUtils.clamp(Math.round(span * 5.6 + 44), 80, 300);
    for (let i = 0; i < NC; i++) {
      const v = i / Math.max(1, NC - 1);
      const ty = cBot + v * (apexY - cBot) + (rnd() - 0.5) * 0.9;
      const cap = Math.pow(Math.max(0, (v - 0.85) / 0.15), 2);
      const domeR = cRX * (0.5 + 0.5 * Math.min(1, v * 1.2)) * (1 - 0.5 * cap);
      const a = i * GA + rnd() * 0.5;
      const rr = 0.5 + 0.5 * Math.sqrt(rnd());
      const target = new THREE.Vector3(Math.cos(a) * domeR * rr, ty, Math.sin(a) * domeR * rr);
      if (blocked(target, 0.7)) continue;
      const oy = THREE.MathUtils.clamp(ty - 1.0 - rnd() * 1.0, cBot - 0.5, trunkTopY);
      const sp = spineAt(oy);
      const dir = target.clone().sub(sp);
      if (dir.lengthSq() < 0.01) continue;
      dir.normalize();
      grow(sp, dir, 1.8 + rnd() * 0.65, 0.09, 5);
    }
    // Leaf collars around active platforms.
    for (let i = 0; i < active; i++) {
      const base = nodes[i].base;
      const tip = nodes[i].tip;
      const dr = deckRadius(i, stargazers);
      const RING = 8;
      for (let k = 0; k < RING; k++) {
        const a = (k / RING) * Math.PI * 2 + i * 1.3;
        const o = tip
          .clone()
          .add(new THREE.Vector3(Math.cos(a) * dr * 1.04, -0.25 + rnd() * 0.3, Math.sin(a) * dr * 1.04));
        const out = new THREE.Vector3(Math.cos(a) * 0.85, 0.45 + rnd() * 0.6, Math.sin(a) * 0.85).normalize();
        grow(o, out, 1.15 + rnd() * 0.65, 0.06, 3);
      }
      // Add a small leafy backdrop behind each deck.
      for (let k = 0; k < 3; k++) {
        const a = i * 1.3 + k * 1.7;
        const o = tip
          .clone()
          .add(new THREE.Vector3(Math.cos(a) * dr * 1.08, 0.1, Math.sin(a) * dr * 1.08));
        grow(o, new THREE.Vector3(Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35).normalize(), 1.65 + rnd() * 0.65, 0.055, 3);
      }
    }
    // Dense tip canopy around the upper trunk.
    for (let k = 0; k < 14; k++) {
      const a = k * GA + 0.3;
      const o = spineAt(trunkTopY - rnd() * 1.6);
      const out = new THREE.Vector3(Math.cos(a), 0.25 + rnd() * 0.7, Math.sin(a)).normalize();
      grow(o, out, 0.9 + rnd() * 0.75, 0.05, 3);
    }
    const tipBase = spineAt(trunkTopY);
    for (let k = 0; k < 16; k++) {
      const p = tipBase
        .clone()
        .add(new THREE.Vector3((rnd() - 0.5) * 1.3, rnd() * 1.5 - 0.2, (rnd() - 0.5) * 1.3));
      addLeaf(p, tipBase, 0.024);
    }

    // Inner rosette that covers the trunk from top-down views.
    for (let layer = 0; layer < 5; layer++) {
      const lt = layer / 4;
      const center = spineAt(trunkTopY - 0.7 + lt * 2.2);
      const ring = 14 + layer * 3;
      for (let k = 0; k < ring; k++) {
        const a = k * GA + layer * 0.58;
        const radius = THREE.MathUtils.lerp(0.45, 2.55, lt) * (0.75 + rnd() * 0.5);
        const p = center.clone().add(
          new THREE.Vector3(
            Math.cos(a) * radius,
            (rnd() - 0.25) * 0.45,
            Math.sin(a) * radius,
          ),
        );
        addLeaf(p, center, 0.026);
        if (k % 2 === 0) {
          const out = p.clone().sub(center);
          if (out.lengthSq() > 0.01) addLeafBurst(p, out.normalize(), 3, 0.3, 0.016);
        }
      }
    }

    // Central canopy plug for the top-down camera.
    const plugLayers = 6;
    for (let layer = 0; layer < plugLayers; layer++) {
      const lt = layer / (plugLayers - 1);
      const y = THREE.MathUtils.lerp(cBot + span * 0.48, apexY + 0.55, lt);
      const center = spineAt(y);
      const ring = 12 + Math.round(lt * 14);
      const maxR = THREE.MathUtils.lerp(0.8, 3.0, Math.sin(lt * Math.PI));
      for (let k = 0; k < ring; k++) {
        const a = k * GA + layer * 0.41 + rnd() * 0.12;
        const inner = k % 5 === 0 ? 0.05 + rnd() * 0.18 : 0.22 + rnd() * maxR;
        const p = center.clone().add(
          new THREE.Vector3(
            Math.cos(a) * inner,
            (rnd() - 0.35) * 0.5,
            Math.sin(a) * inner,
          ),
        );
        addLeaf(p, center, 0.022);
        if (k % 3 === 0) {
          const out = p.clone().sub(center);
          if (out.lengthSq() > 0.01) addLeafBurst(p, out.normalize(), 2, 0.24, 0.014);
        }
      }
    }

    // Layered radial branches around the upper trunk.
    const sleeveLayers = 5;
    for (let layer = 0; layer < sleeveLayers; layer++) {
      const ly = THREE.MathUtils.lerp(trunkTopY - 2.3, trunkTopY + 1.7, layer / (sleeveLayers - 1));
      const center = spineAt(ly);
      const ring = layer < 2 ? 12 : 16;
      const layerT = layer / (sleeveLayers - 1);
      const baseReach = THREE.MathUtils.lerp(2.2, 4.3, Math.sin(layerT * Math.PI));
      for (let k = 0; k < ring; k++) {
        const a = k * GA + layer * 0.73 + rnd() * 0.18;
        const reach = baseReach * (0.72 + rnd() * 0.45);
        const out = new THREE.Vector3(
          Math.cos(a) * reach,
          -0.08 + rnd() * 0.55 + layerT * 0.25,
          Math.sin(a) * reach,
        );
        const target = center.clone().add(out);
        if (blocked(target, 0.9)) continue;
        const dir = target.clone().sub(center);
        if (dir.lengthSq() < 0.01) continue;
        grow(center, dir.normalize(), 1.05 + rnd() * 0.45, 0.05, 3);
      }
    }

    // Apex fill uses supported twig growth, not loose leaves.
    const topStart = cBot + span * 0.55;
    const NF = THREE.MathUtils.clamp(Math.round(span * 10), 70, 180);
    for (let i = 0; i < NF; i++) {
      const ty = topStart + (i / Math.max(1, NF - 1)) * (apexY + 0.8 - topStart) + (rnd() - 0.5) * 0.8;
      const vv = THREE.MathUtils.clamp((ty - cBot) / span, 0, 1);
      const cap = Math.pow(Math.max(0, (vv - 0.85) / 0.15), 2);
      const domeR = cRX * (0.5 + 0.5 * Math.min(1, vv * 1.2)) * (1 - 0.5 * cap);
      const a = i * GA + rnd() * 0.6;
      const rr = 0.35 + 0.65 * Math.sqrt(rnd());
      const target = new THREE.Vector3(Math.cos(a) * domeR * rr, ty, Math.sin(a) * domeR * rr);
      if (blocked(target, 0.7)) continue;
      const oy = THREE.MathUtils.clamp(ty - 0.8 - rnd() * 1.5, cBot, trunkTopY);
      const sp = spineAt(oy);
      const dir = target.clone().sub(sp);
      if (dir.lengthSq() < 0.01) continue;
      grow(sp, dir.normalize(), 1.35 + rnd() * 0.55, 0.058, 4);
    }

    const branchGeo = branchGeos.length ? mergeGeometries(branchGeos, false) : null;
    return { branchGeo, sprigs };
  }, [nodes, active, stargazers, stars]);

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
    // Slow gust modulation for natural canopy motion.
    const gustWave =
      0.72 +
      0.18 * Math.sin(t * 0.45) +
      0.08 * Math.sin(t * 1.7 + 1.1) +
      gust * 0.18 * Math.sin(t * 0.9 + 0.4);
    const w = wind * gustWave;
    // Drive the batched leaf shader.
    windUniforms.current.uTime.value = t;
    windUniforms.current.uWind.value = w;
    windUniforms.current.uWindDir.value.set(windVec[0], windVec[1]).normalize();
    if (!swayRef.current) return;
    // Lean the whole crown downwind.
    const lean = Math.min(0.12, 0.012 + wind * 0.028 + gust * 0.012) * gustWave;
    const side = Math.sin(t * (0.62 + wind * 0.12)) * 0.012 * wind;
    swayRef.current.rotation.z = -windVec[0] * lean + windVec[1] * side;
    swayRef.current.rotation.x = windVec[1] * lean + windVec[0] * side * 0.55;
    branchRefs.current.forEach((group, i) => {
      if (!group || !group.visible) return;
      const phase = i * 0.7;
      const bend = Math.min(0.06, 0.01 + w * 0.016);
      const flutter = Math.sin(t * (0.95 + wind * 0.16) + phase) * 0.014 * w;
      group.rotation.z = -windVec[0] * bend + windVec[1] * flutter;
      group.rotation.x = windVec[1] * bend + Math.cos(t * 0.72 + i) * 0.009 * w;
    });
  });

  // Small intro settle without changing platform spacing.
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

        {/* Merged procedural branch skeleton. */}
        {active > 0 && crownStructure.branchGeo && (
          <mesh geometry={crownStructure.branchGeo} material={materials.bark} />
        )}

        {/* Instanced canopy leaves. */}
        <LeafClumps
          clumps={crownStructure.sprigs}
          geometry={sprigGeo}
          material={materials.leaf}
          grown={active > 0}
        />

        {/* Cheap canopy shadow proxy. */}
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
