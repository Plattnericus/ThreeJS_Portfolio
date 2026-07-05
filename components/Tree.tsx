"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import gsap from "gsap";
import { animated, useSpring } from "@react-spring/three";
import { bonsaiNodes, makeTaperedTubeGeometry, spineAt } from "@/lib/bonsai";
import { treeHeight, trunkBaseRadius, trunkHeight } from "@/lib/growth";
import { MAX_HOUSES } from "@/lib/layout";
import { useQualityProfile } from "@/lib/quality";
import { deckRadius, type Tier } from "@/lib/rarity";
import { CLOUD_SHADOW_FRAG } from "@/lib/shaderChunks";

type Clump = {
  pos: THREE.Vector3;
  rot: [number, number, number];
  scl: number;
  shade: number; // 0 deep inside the crown .. 1 outer/top (baked AO)
  hue: number; // per-sprig warm/cool + translucency variation
  phase: number; // wind decorrelation
};

// Instanced leaf clumps for one canopy batch.
function LeafClumps({
  clumps,
  geometry,
  material,
  depthMaterial,
  grown,
  castShadow = false,
  receiveShadow = false,
}: {
  clumps: Clump[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  depthMaterial?: THREE.Material;
  grown: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
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
    // Per-instance shade/hue/phase for the leaf shader.
    const aLeaf = new Float32Array(clumps.length * 3);
    clumps.forEach((c, i) => {
      e.set(c.rot[0], c.rot[1], c.rot[2]);
      q.setFromEuler(e);
      s.setScalar(c.scl);
      m.compose(c.pos, q, s);
      mesh.setMatrixAt(i, m);
      aLeaf[i * 3] = c.shade;
      aLeaf[i * 3 + 1] = c.hue;
      aLeaf[i * 3 + 2] = c.phase;
    });
    geometry.setAttribute("aLeaf", new THREE.InstancedBufferAttribute(aLeaf, 3));
    mesh.instanceMatrix.needsUpdate = true;
    // Correct culling sphere — the base sprig geometry alone is tiny.
    mesh.computeBoundingSphere();
    mesh.visible = grown;
    mesh.scale.setScalar(grown ? 1 : 0.001);
  }, [clumps, geometry, grown]);

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
      customDepthMaterial={depthMaterial}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      scale={0.001}
      visible={false}
    />
  );
}

const BARK = "#6b4028";
const BARK_DARK = "#352016";
const BARK_LIGHT = "#a87854";

// Procedural bark texture generated once per resolution and cached.
const _barkTex = new Map<
  number,
  { map: THREE.Texture; bump: THREE.Texture; rough: THREE.Texture }
>();
function getBarkTextures(size = 512) {
  const cached = _barkTex.get(size);
  if (cached) return cached;
  const S = size;
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
      // Moss grows on ONE (weather) side of the trunk and thickest near the
      // base — a green fbm gated by azimuth (fy in [0,1] = angle) and height.
      const mossSide = smooth(0.05, 0.4, Math.cos(ang - 1.1) * 0.5 + 0.5);
      const mossLow = 1 - smooth(0.15, 0.55, fx);
      const mossN = smooth(0.45, 0.75, fbm3(cxw * 1.7 + 3.3, upw * 1.2, czw * 1.7));
      const moss = clamp01(mossSide * mossLow * mossN);
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
      // Damp green moss on the weather side.
      r = lerp(r, 74, moss * 0.7);
      g = lerp(g, 92, moss * 0.7);
      b = lerp(b, 48, moss * 0.7);
      const gv = (grain - 0.5) * 22;
      const idx = (y * S + x) * 4;
      cI.data[idx] = byte(r + gv);
      cI.data[idx + 1] = byte(g + gv * 0.7);
      cI.data[idx + 2] = byte(b + gv * 0.4);
      cI.data[idx + 3] = 255;
      const hv = byte(h * 255);
      bI.data[idx] = bI.data[idx + 1] = bI.data[idx + 2] = hv;
      bI.data[idx + 3] = 255;
      const rv = byte(clamp01(0.74 + crack * 0.36 - (plate - 0.5) * 0.14 + moss * 0.2) * 255);
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
    t.anisotropy = 16;
  }
  const result = { map, bump, rough };
  _barkTex.set(size, result);
  return result;
}

function makeBarkMaterial(_color = BARK, size = 512) {
  const { map, bump, rough } = getBarkTextures(size);
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

// Base green the atlas is painted in — the seasonal tint uniform is expressed
// relative to it so summer stays neutral and autumn/winter re-hue the atlas.
const BASE_LEAF_RGB = new THREE.Color("#5aa238");

// Shared wind vertex code — injected into the visible leaf material AND the
// shadow depth material so dappled leaf shadows never drift against the
// leaves themselves.
const LEAF_WIND_PARS = `
uniform float uTime;
uniform float uWind;
uniform vec2 uWindDir;
attribute vec3 aLeaf;
varying vec3 vLeaf;
varying vec3 vWPos;
`;
const LEAF_WIND_VERTEX = `
vLeaf = aLeaf;
#ifdef USE_INSTANCING
  vec3 instPos = vec3(instanceMatrix[3].xyz);
#else
  vec3 instPos = vec3(0.0);
#endif
float lph = aLeaf.z * 6.2831853;
vec2 wdir = normalize(uWindDir);
vec2 wside = vec2(-wdir.y, wdir.x);
float hf = 0.35 + max(transformed.y, 0.0) * 0.6;
// Octave 1 — gust front: travels ACROSS the crown instead of pulsing globally.
float gustPhase = dot(instPos.xz, wdir) * 0.22 - uTime * 1.05;
float gustW = 0.55 + 0.45 * sin(gustPhase + lph * 0.6) * (0.7 + 0.3 * sin(uTime * 0.43 + lph));
// Octave 2 — branch-scale wave riding the gust front.
float branchWave = sin(gustPhase * 2.3 + lph * 2.0);
// Octave 3 — high-frequency leaf flutter, amplitude gated by the gust.
float flutter = sin(uTime * 6.8 + lph * 13.0 + position.y * 9.0) * (0.25 + 0.75 * gustW);
float downwind = (0.035 + branchWave * 0.02) * uWind * hf * gustW;
float lateral = (sin(uTime * 2.6 + lph * 1.7) * 0.016 + cos(uTime * 1.35 + lph) * 0.011) * uWind * hf;
transformed.x += wdir.x * downwind + wside.x * lateral;
transformed.z += wdir.y * downwind + wside.y * lateral;
transformed.y += sin(uTime * 1.6 + lph * 1.3) * 0.012 * uWind * hf;
transformed += normal * (flutter * 0.015 * uWind);
#ifdef USE_INSTANCING
  vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
`;

type LeafUniforms = {
  uTime: { value: number };
  uWind: { value: number };
  uWindDir: { value: THREE.Vector2 };
  uSunDirW: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uSSS: { value: number };
  uSnow: { value: number };
  uLeafTint: { value: THREE.Color };
  uWet: { value: number };
  uCloudCover: { value: number };
  uAerial: { value: number };
};

// Procedural leaf-card atlas (2×2 tiles): three veined leaf CLUSTERS plus one
// big single leaf, painted once per resolution and cached. Each canopy card
// samples one tile, so a single quad reads as 6–9 individual leaves. RGB is
// pre-flooded with mid-green so mipmaps never ring dark at the alpha edges.
const _leafAtlas = new Map<number, THREE.CanvasTexture>();
function getLeafAtlas(size: number): THREE.CanvasTexture {
  const cached = _leafAtlas.get(size);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = maskCanvas.height = size;
  const mctx = maskCanvas.getContext("2d")!;
  ctx.fillStyle = "#4d7a2e";
  ctx.fillRect(0, 0, size, size);
  mctx.fillStyle = "#000";
  mctx.fillRect(0, 0, size, size);

  let seed = 11;
  const rnd = () => {
    seed += 1;
    const x = Math.sin(seed * 91.7 + 13.1) * 43758.5453;
    return x - Math.floor(x);
  };

  // One leaf: jittered teardrop outline, base→tip gradient, midrib + side
  // veins and a dark edge on the color canvas; plain white on the alpha mask.
  const leaf = (cx: number, cy: number, rot: number, len: number) => {
    const wHalf = len * (0.3 + rnd() * 0.08);
    const j = () => (rnd() - 0.5) * len * 0.05;
    const path = new Path2D();
    path.moveTo(0, 0);
    path.bezierCurveTo(wHalf + j(), -len * 0.25 + j(), wHalf * 0.82 + j(), -len * 0.78 + j(), 0, -len);
    path.bezierCurveTo(-wHalf * 0.82 + j(), -len * 0.78 + j(), -wHalf + j(), -len * 0.25 + j(), 0, 0);

    ctx.save();
    mctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    mctx.translate(cx, cy);
    mctx.rotate(rot);
    const grad = ctx.createLinearGradient(0, 0, 0, -len);
    const bright = 0.92 + rnd() * 0.16;
    const hueShift = Math.round((rnd() - 0.5) * 12);
    grad.addColorStop(0, `hsl(${96 + hueShift}, 47%, ${24 * bright}%)`);
    grad.addColorStop(1, `hsl(${88 + hueShift}, 44%, ${42 * bright}%)`);
    ctx.fillStyle = grad;
    ctx.fill(path);
    ctx.strokeStyle = "rgba(36, 61, 22, 0.4)";
    ctx.lineWidth = Math.max(1, size / 340);
    ctx.stroke(path);
    ctx.strokeStyle = "rgba(176, 214, 130, 0.55)";
    ctx.lineWidth = Math.max(1, size / 512);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -len * 0.92);
    ctx.stroke();
    ctx.globalAlpha = 0.5;
    const veins = 4 + Math.floor(rnd() * 3);
    for (let v = 1; v <= veins; v++) {
      const t = v / (veins + 1);
      const vy = -len * (0.15 + t * 0.7);
      const vl = wHalf * (1 - t) * 1.3;
      ctx.beginPath();
      ctx.moveTo(0, vy);
      ctx.lineTo(vl * 0.9, vy - vl * 0.55);
      ctx.moveTo(0, vy);
      ctx.lineTo(-vl * 0.9, vy - vl * 0.55);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    mctx.fillStyle = "#fff";
    mctx.fill(path);
    ctx.restore();
    mctx.restore();
  };

  const T = size / 2;
  for (let tile = 0; tile < 4; tile++) {
    const tx0 = (tile % 2) * T;
    const ty0 = Math.floor(tile / 2) * T;
    const clip = new Path2D();
    clip.rect(tx0, ty0, T, T);
    ctx.save();
    mctx.save();
    ctx.clip(clip);
    mctx.clip(clip);
    if (tile === 3) {
      leaf(tx0 + T / 2, ty0 + T * 0.86, (rnd() - 0.5) * 0.2, T * 0.72);
    } else {
      const n = 6 + Math.floor(rnd() * 4);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.8;
        const d = T * (0.04 + rnd() * 0.1);
        leaf(
          tx0 + T / 2 + Math.cos(a) * d,
          ty0 + T / 2 + Math.sin(a) * d,
          a + Math.PI * 0.5,
          T * (0.28 + rnd() * 0.12),
        );
      }
    }
    ctx.restore();
    mctx.restore();
  }

  // Copy the mask into the alpha channel; RGB keeps the green ground.
  const img = ctx.getImageData(0, 0, size, size);
  const alpha = mctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) img.data[i + 3] = alpha.data[i];
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  _leafAtlas.set(size, tex);
  return tex;
}

// Leaf material: atlas-textured cards with a 3-octave wind field, crown-depth
// AO, sun-through-leaf translucency, snow dusting on up-facing cards, wet-rain
// gloss, drifting cloud shadows and a sky rim. Everything is uniform-driven —
// weather/season changes never recompile the shader.
function makeLeafMaterial(
  atlas: THREE.Texture,
  uniforms: LeafUniforms,
  alphaToCoverage: boolean,
) {
  const mat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: atlas,
    alphaTest: 0.35,
    alphaToCoverage,
    roughness: 0.72,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  mat.onBeforeCompile = (shader) => {
    for (const [k, v] of Object.entries(uniforms)) shader.uniforms[k] = v;
    shader.vertexShader =
      LEAF_WIND_PARS +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\n${LEAF_WIND_VERTEX}`,
      );
    shader.fragmentShader =
      `
uniform float uTime;
uniform float uWind;
uniform vec2 uWindDir;
uniform vec3 uSunDirW;
uniform vec3 uSunColor;
uniform float uSSS;
uniform float uSnow;
uniform vec3 uLeafTint;
uniform float uWet;
uniform float uCloudCover;
uniform float uAerial;
varying vec3 vLeaf;
varying vec3 vWPos;
` +
      shader.fragmentShader
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
        // Warm/cool per-sprig variation + seasonal tint (uniform, no recompile).
        vec3 leafWarm = vec3(1.10, 1.04, 0.78);
        vec3 leafCool = vec3(0.84, 1.00, 1.08);
        diffuseColor.rgb *= uLeafTint * mix(leafCool, leafWarm, vLeaf.y) * (0.84 + vLeaf.y * 0.28);
        // Crown-depth AO: leaves deep inside the crown sit in their own shade.
        diffuseColor.rgb *= mix(0.52, 1.05, vLeaf.x);
        // Snow dust settles ONLY on upward-facing cards (mirror of Island uSnow).
        vec3 leafWN = inverseTransformDirection(normalize(vNormal), viewMatrix);
        float leafUp = smoothstep(0.15, 0.65, leafWN.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 1.00), uSnow * leafUp * 0.85);
        // Rain-wet foliage darkens...
        diffuseColor.rgb *= 1.0 - uWet * 0.25;
        ${CLOUD_SHADOW_FRAG}`,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
        // ...and turns glossy, so a low sun glints on wet leaves.
        roughnessFactor = max(0.15, roughnessFactor - uWet * 0.45);`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
        // Sun-through-leaf translucency: looking toward the sun through the
        // crown lights thin leaves up chlorophyll green-gold (golden hour!).
        vec3 sunV = normalize((viewMatrix * vec4(uSunDirW, 0.0)).xyz);
        vec3 leafV = normalize(vViewPosition);
        float backlit = pow(clamp(dot(leafV, -sunV), 0.0, 1.0), 2.5);
        float thin = 0.55 + 0.45 * vLeaf.y;
        totalEmissiveRadiance += uSunColor * (backlit * uSSS * thin * vLeaf.x) * diffuseColor.rgb * vec3(0.90, 1.00, 0.45);
        // Sky rim keeps the crown silhouette readable against the dome.
        float rim = pow(1.0 - clamp(dot(leafV, normalize(vNormal)), 0.0, 1.0), 3.0);
        totalEmissiveRadiance += rim * uSunColor * 0.06 * vLeaf.x;
        // Aerial perspective: a warm sun-lit haze builds on the DISTANT crown as
        // a depth cue. Purely additive — it can only add light, never blank the
        // canopy — and it's gated by uAerial (0 on low/medium).
        float aeD = length(vWPos - cameraPosition);
        float aeHaze = (1.0 - exp(-aeD * 0.013)) * uAerial;
        vec3 aeView = normalize(vWPos - cameraPosition);
        float aeSun = max(dot(aeView, normalize(uSunDirW)), 0.0);
        totalEmissiveRadiance += uSunColor * aeHaze * (0.2 + 0.8 * pow(aeSun, 3.0)) * 0.5;`,
        );
  };
  return mat;
}

// Leaf sprig geometry used by each canopy instance: 24 gently folded quad
// cards (4 tris each — ~2.6× cheaper than the old bezier cards), each
// UV-mapped to one atlas tile so a single card reads as a small leaf cluster.
// Soft "volume" normals make the crown shade like a rounded mass instead of a
// pile of flat cards.
function makeLeafSprigGeometry(): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  const N = 24;
  let seed = 5;
  const rnd = () => {
    seed += 1;
    const x = Math.sin(seed * 91.7 + 13.1) * 43758.5453;
    return x - Math.floor(x);
  };
  const UP = new THREE.Vector3(0, 1, 0);
  const sprigCenter = new THREE.Vector3(0, 0.3, 0);
  const center = new THREE.Vector3();
  const vtx = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const g = new THREE.PlaneGeometry(0.46, 0.6, 1, 2);
    g.translate(0, 0.3, 0); // base at the twig anchor, card grows upward
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    // Gentle fold: the middle vertex row pops forward.
    for (let v = 0; v < pos.count; v++) {
      if (Math.abs(pos.getY(v) - 0.3) < 0.01) pos.setZ(v, 0.06);
    }
    // Atlas tile: mostly clusters, occasionally the big single leaf. Canvas
    // row 0 is the TOP of the texture (flipY), i.e. v in [0.5, 1].
    const tile = rnd() < 0.12 ? 3 : Math.floor(rnd() * 3);
    const tx = tile % 2;
    const ty = 1 - Math.floor(tile / 2);
    const mirror = rnd() < 0.5;
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    for (let v = 0; v < uv.count; v++) {
      const u = mirror ? 1 - uv.getX(v) : uv.getX(v);
      uv.setXY(v, (tx + u) * 0.5, (ty + uv.getY(v)) * 0.5);
    }
    g.rotateX(-0.45 - (i % 5) * 0.15);
    g.rotateY(i * 2.39996 + 0.5);
    g.translate((i % 4 - 1.5) * 0.045, 0.26 + (i % 7) * 0.018, ((i * 7) % 7 - 3) * 0.032);
    const cnt = pos.count;
    const shade = 0.68 + (i % 7) * 0.055;
    g.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(cnt * 3).fill(shade), 3),
    );
    // Soft volume normals: away from the sprig core, blended toward up.
    center.set(0, 0, 0);
    for (let v = 0; v < cnt; v++) center.add(vtx.fromBufferAttribute(pos, v));
    center.divideScalar(cnt);
    const soft = center.clone().sub(sprigCenter);
    if (soft.lengthSq() < 1e-4) soft.set(0, 1, 0);
    soft.normalize().lerp(UP, 0.4).normalize();
    const nor = g.getAttribute("normal") as THREE.BufferAttribute;
    for (let v = 0; v < nor.count; v++) nor.setXYZ(v, soft.x, soft.y, soft.z);
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

export function Tree({
  stars,
  wind = 1,
  gust = 0,
  windVec = [1, 0],
  leafColor = "#5aa238",
  snow = 0,
  twilight = 0,
  sunDir = [12, 18, 8],
  sunColor = "#fff2d8",
  sunIntensity = 1,
  wet = 0,
  cloudCover = 0,
  forceProxyShadows = false,
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
  twilight?: number;
  sunDir?: [number, number, number];
  sunColor?: string;
  sunIntensity?: number;
  wet?: number;
  cloudCover?: number;
  forceProxyShadows?: boolean;
  stargazers?: { tier?: Tier }[] | null;
} & ThreeElements["group"]) {
  const swayRef = useRef<THREE.Group>(null);
  const trunkRef = useRef<THREE.Group>(null);
  const branchRefs = useRef<(THREE.Group | null)[]>([]);
  const quality = useQualityProfile();
  const sprigDensity = quality.sprigDensity;
  const nodes = useMemo(() => bonsaiNodes(MAX_HOUSES), []);
  const active = Math.min(MAX_HOUSES, Math.max(0, Math.floor(stars)));
  // The 5-minute stargazer sync delivers a NEW array with the same tiers —
  // key the expensive canopy rebuild on the tier content, not array identity.
  const tierKey = useMemo(
    () => stargazers?.map((s) => s.tier ?? "").join("|") ?? "",
    [stargazers],
  );
  const sprigGeo = useMemo(makeLeafSprigGeometry, []);
  // Shared uniforms for batched canopy motion + shading. ONE object feeds the
  // visible leaf material AND the shadow depth material.
  const windUniforms = useRef<LeafUniforms>({
    uTime: { value: 0 },
    uWind: { value: 1 },
    uWindDir: { value: new THREE.Vector2(windVec[0], windVec[1]) },
    uSunDirW: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
    uSunColor: { value: new THREE.Color("#fff2d8") },
    uSSS: { value: 0.2 },
    uSnow: { value: 0 },
    uLeafTint: { value: new THREE.Color("#ffffff") },
    uWet: { value: 0 },
    uCloudCover: { value: 0 },
    uAerial: { value: 0 },
  });

  const materials = useMemo(
    () => ({
      bark: makeBarkMaterial(BARK, quality.barkTexSize),
      barkDark: makeBarkMaterial(BARK_DARK, quality.barkTexSize),
      barkLight: makeBarkMaterial(BARK_LIGHT, quality.barkTexSize),
      ringCap: makeRingCapMaterial(),
      leaf: makeLeafMaterial(
        getLeafAtlas(quality.leafAtlasSize),
        windUniforms.current,
        quality.antialias,
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- quality is fixed per Canvas mount (tier change remounts)
    [],
  );

  // Real leaf-shaped shadows (high/extreme): the depth pass runs the SAME
  // wind chunk + alpha test as the visible leaves, so the dappled shadows
  // sway in lockstep instead of drifting.
  const realShadows = quality.leafShadows === "real" && !forceProxyShadows;
  const leafDepthMaterial = useMemo(() => {
    const mat = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: getLeafAtlas(quality.leafAtlasSize),
      alphaTest: 0.35,
      side: THREE.DoubleSide,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windUniforms.current.uTime;
      shader.uniforms.uWind = windUniforms.current.uWind;
      shader.uniforms.uWindDir = windUniforms.current.uWindDir;
      shader.vertexShader =
        LEAF_WIND_PARS +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>\n${LEAF_WIND_VERTEX}`,
        );
    };
    return mat;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- quality is fixed per Canvas mount
  }, []);

  useEffect(() => {
    const u = windUniforms.current;
    // Seasonal tint relative to the atlas base green (summer ≈ identity).
    const tint = new THREE.Color(leafColor);
    u.uLeafTint.value.setRGB(
      tint.r / BASE_LEAF_RGB.r,
      tint.g / BASE_LEAF_RGB.g,
      tint.b / BASE_LEAF_RGB.b,
    );
    u.uSnow.value = Math.min(1, snow);
    u.uSunColor.value.set(sunColor);
    // Translucency swells toward the golden hour and dies with the sun.
    u.uSSS.value =
      (0.16 + twilight * 0.85) * THREE.MathUtils.clamp(sunIntensity, 0, 1);
    u.uAerial.value = quality.aerial;
  }, [leafColor, snow, twilight, sunColor, sunIntensity, quality.aerial]);

  // Trunk follows the procedural spine and grows with the tower. All static
  // wood (trunk + stubs, roots, ring caps) is merged into ONE geometry per
  // material — 3 draw calls instead of 17.
  const trunkH = trunkHeight(stars);
  const trunkR = trunkBaseRadius(stars);
  const woodGeos = useMemo(() => {
    const H = trunkH;
    const baseR = trunkR;
    const barkGeos: THREE.BufferGeometry[] = [];
    const capGeos: THREE.BufferGeometry[] = [];

    const segs = THREE.MathUtils.clamp(Math.round(H * 2), 24, 220);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segs; i++) pts.push(spineAt((i / segs) * H));
    barkGeos.push(makeTaperedTubeGeometry(pts, baseR, baseR * 0.24, segs, 18, 0.5, 0.7));

    // Small branch stubs break up the trunk silhouette.
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
    specs.forEach((s, i) => {
      const center = spineAt(s.y);
      const radial = new THREE.Vector3(Math.cos(s.ang), 0, Math.sin(s.ang));
      const dir = radial.clone().add(new THREE.Vector3(0, s.up, 0)).normalize();
      const rT = trunkRadiusAt(s.y);
      const base = center.clone().addScaledVector(radial, rT * 0.5);
      const mid = center.clone().addScaledVector(dir, rT * 0.8 + s.len * 0.45);
      const tip = center.clone().addScaledVector(dir, rT * 0.85 + s.len);
      const rEnd = s.r * 0.82;
      barkGeos.push(makeTaperedTubeGeometry([base, mid, tip], s.r, rEnd, 10, 9, i * 0.7));
      const cap = new THREE.CircleGeometry(rEnd * 1.05, 18);
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      const capPos = tip.clone().addScaledVector(dir, 0.004);
      cap.applyMatrix4(new THREE.Matrix4().compose(capPos, quat, new THREE.Vector3(1, 1, 1)));
      capGeos.push(cap);
    });

    const spread = 1 + baseR * 1.3;
    const rootGeos = Array.from({ length: 10 }, (_, i) => {
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
      return makeTaperedTubeGeometry([p0, p1, p2], baseR * 0.35, 0.06, 18, 7, i * 0.7);
    });

    return {
      bark: mergeGeometries(barkGeos, false),
      roots: mergeGeometries(rootGeos, false),
      caps: capGeos.length ? mergeGeometries(capGeos, false) : null,
    };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tierKey captures the only stargazer data used (deck tiers)
  }, [active, nodes, tierKey]);

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
    const BS = quality.canopyBudgetScale;
    // A giant tree carries proportionally bigger tufts instead of exploding
    // the instance count.
    const sprigBoost = 1 + 0.15 * THREE.MathUtils.clamp(span / 14 - 1, 0, 1);

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
      // Crown-depth shade input: radial distance from the spine relative to
      // the local dome radius (reused below as baked per-instance AO).
      const vh = THREE.MathUtils.clamp((p.y - cBot) / span, 0, 1);
      const dR = Math.max(0.6, cRX * (0.5 + 0.5 * Math.min(1, vh * 1.2)));
      const spn = spineAt(p.y);
      const radial = Math.hypot(p.x - spn.x, p.z - spn.z) / dR;
      let scl = (0.7 + rnd() * 0.75) * sprigBoost;
      // Bigger tufts on the silhouette break the smooth dome into real lobes.
      if (radial > 0.8) scl *= 1.25;
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
      const shade = THREE.MathUtils.clamp(radial * 0.85 + vh * 0.25, 0, 1);
      sprigs.push({
        pos: p,
        rot: [rnd() * Math.PI * 2, rnd() * Math.PI * 2, rnd() * Math.PI],
        scl,
        shade,
        hue: rnd(),
        phase: rnd(),
      });
    };
    const addLeafBurst = (
      anchor: THREE.Vector3,
      dir: THREE.Vector3,
      baseCount: number,
      spread: number,
      twigRadius: number,
    ) => {
      // Canopy density scales with the graphics tier.
      const count = Math.max(1, Math.round(baseCount * sprigDensity));
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

    // Size-STABLE density: budgets grow with the crown span (no hard ceiling
    // that would starve a tall tree of leaves) — the tier scales via BS.
    let budget = Math.round(THREE.MathUtils.clamp(span, 4, 26) * 420 * BS);
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
        addLeafBurst(end, dir, 14, 0.48, rad * 0.16);
        return;
      }
      // Add denser foliage on thinner outer twigs.
      if (depth <= 3) addLeafBurst(end, dir, 2, 0.18, rad * 0.22);
      if (depth <= 2) addLeafBurst(end, dir, 3, 0.26, rad * 0.2);
      if (depth <= 1) addLeafBurst(end, dir, 8, 0.4, rad * 0.18);
      const n = depth >= 3 ? (rnd() < 0.5 ? 3 : 2) : 2;
      for (let c = 0; c < n; c++) {
        grow(end, childDir(dir, 0.3 + rnd() * 0.4), len * (0.62 + rnd() * 0.16), rad * 0.68, depth - 1);
      }
    };

    // Main crown shell — scales with span so big trees stay just as lush.
    const NC = Math.max(90, Math.round((span * 7.5 + 50) * BS));
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
    const NF = Math.max(80, Math.round(span * 12 * BS));
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

    // Inner-volume fill: plain sprigs INSIDE the hull (no twig geometry) so
    // the crown reads as a solid mass when the camera dives in or orbits low —
    // without it the shell is visibly hollow.
    const NI = Math.round(NC * 0.35);
    for (let i = 0; i < NI; i++) {
      const vv = 0.15 + 0.75 * rnd();
      const ty = cBot + vv * span;
      const cap = Math.pow(Math.max(0, (vv - 0.85) / 0.15), 2);
      const domeR = cRX * (0.5 + 0.5 * Math.min(1, vv * 1.2)) * (1 - 0.5 * cap);
      const a = i * GA + rnd() * 0.7;
      const rr = 0.25 + 0.4 * rnd();
      const c = spineAt(ty);
      addLeaf(
        new THREE.Vector3(c.x + Math.cos(a) * domeR * rr, ty, c.z + Math.sin(a) * domeR * rr),
      );
    }

    const branchGeo = branchGeos.length ? mergeGeometries(branchGeos, false) : null;
    return { branchGeo, sprigs };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tierKey captures the only stargazer data used (deck tiers)
  }, [nodes, active, stars, sprigDensity, quality.canopyBudgetScale, tierKey]);

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
    const u = windUniforms.current;
    u.uTime.value = t;
    u.uWind.value = w;
    u.uWindDir.value.set(windVec[0], windVec[1]).normalize();
    u.uSunDirW.value.set(sunDir[0], sunDir[1], sunDir[2]).normalize();
    u.uWet.value = wet;
    u.uCloudCover.value = cloudCover;
    if (!swayRef.current) return;
    // Lean the whole crown downwind.
    const lean = Math.min(0.12, 0.012 + wind * 0.028 + gust * 0.012) * gustWave;
    const side = Math.sin(t * (0.62 + wind * 0.12)) * 0.012 * wind;
    swayRef.current.rotation.z = -windVec[0] * lean + windVec[1] * side;
    swayRef.current.rotation.x = windVec[1] * lean + windVec[0] * side * 0.55;
    // Per-branch flex lives in the leaf vertex shader (gust field) — no CPU
    // rotation loop per frame; branchRefs only drive the grow-in animation.
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
          <mesh geometry={woodGeos.bark} material={materials.bark} castShadow receiveShadow />
          <mesh geometry={woodGeos.roots} material={materials.barkDark} castShadow receiveShadow />
          {woodGeos.caps && (
            <mesh geometry={woodGeos.caps} material={materials.ringCap} castShadow />
          )}
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

        {/* Merged procedural branch skeleton (casts twig shadows between the
            leaf dapples when real shadows are on — it is ONE mesh). */}
        {active > 0 && crownStructure.branchGeo && (
          <mesh
            geometry={crownStructure.branchGeo}
            material={materials.bark}
            castShadow={realShadows}
          />
        )}

        {/* Instanced canopy leaves. */}
        <LeafClumps
          clumps={crownStructure.sprigs}
          geometry={sprigGeo}
          material={materials.leaf}
          depthMaterial={realShadows ? leafDepthMaterial : undefined}
          grown={active > 0}
          castShadow={realShadows}
          receiveShadow={realShadows && quality.canopySelfShadow}
        />

        {/* Cheap canopy shadow proxy (low/medium or perf fallback). */}
        {active > 0 && !realShadows && (
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
