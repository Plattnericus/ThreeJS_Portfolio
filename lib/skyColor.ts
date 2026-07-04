import * as THREE from "three";

// Physically-based single-scattering atmosphere (Preetham-style — the same
// math family as three.js' Sky example). This JS implementation mirrors the
// GLSL dome in components/Sky.tsx EXACTLY, so fog, scene background and light
// colors are sampled from the SAME atmosphere the player sees.
//
// All colors returned here are LINEAR; convert to sRGB before storing as hex.

export type Atmosphere = {
  turbidity: number; // haze: 2 alpine-clear .. 14 murky
  rayleigh: number; // molecular scattering strength (blue depth)
  mieCoefficient: number; // aerosol amount (forward glow around the sun)
  mieDirectionalG: number; // aerosol anisotropy
  exposure: number; // artistic energy scale for the model output
  overcast: number; // 0..1 flatten toward neutral gray cloud deck
  moodMix: number; // 0..1 rain/storm tint blend
  moodColor: [number, number, number]; // linear rain/storm tint
  moonE: number; // moonlit-sky energy (already gated by visibility/phase)
};

const TOTAL_RAYLEIGH = new THREE.Vector3(
  5.804542996261093e-6,
  1.3562911419845635e-5,
  3.0265902468824876e-5,
);
const MIE_CONST = new THREE.Vector3(
  1.8399918514433978e14,
  2.7798023919660528e14,
  4.0790479543861094e14,
);
const EE = 1000;
const CUTOFF_ANGLE = Math.PI / 1.95;
const STEEPNESS = 1.5;
const RAYLEIGH_ZENITH = 8400;
const MIE_ZENITH = 1250;
const SUN_DISTANCE = 400000; // magnitude used by the sunfade term
// Real solar angular radius is ~0.266°; slightly larger reads better on screen.
export const SUN_ANGULAR_DIAMETER_COS = Math.cos(0.0075);

const clamp = THREE.MathUtils.clamp;

function sunIntensity(cosZenith: number): number {
  const zenithAngle = Math.acos(clamp(cosZenith, -1, 1));
  return EE * Math.max(0, 1 - Math.exp(-((CUTOFF_ANGLE - zenithAngle) / STEEPNESS)));
}

function totalMie(turbidity: number, mieCoefficient: number): THREE.Vector3 {
  const c = 0.2 * turbidity * 10e-18;
  return MIE_CONST.clone().multiplyScalar(0.434 * c * mieCoefficient);
}

function rayleighPhase(cosTheta: number): number {
  return (3 / (16 * Math.PI)) * (1 + cosTheta * cosTheta);
}

function hgPhase(cosTheta: number, g: number): number {
  const g2 = g * g;
  return (1 / (4 * Math.PI)) * ((1 - g2) / Math.pow(1 - 2 * g * cosTheta + g2, 1.5));
}

/**
 * Sample the sky color for a view direction. `sunDir`/`moonDir` are unit
 * world directions (+Y up). Includes the weather (overcast/mood) and the
 * moonlit-night terms so it matches the dome shader output.
 */
export function sampleSky(
  dir: THREE.Vector3,
  sunDir: THREE.Vector3,
  moonDir: THREE.Vector3,
  a: Atmosphere,
): THREE.Color {
  const sunE = sunIntensity(sunDir.y);
  const sunfade = 1 - clamp(1 - Math.exp((sunDir.y * SUN_DISTANCE) / 450000), 0, 1);

  const rayleighCoefficient = a.rayleigh - 1 * (1 - sunfade);
  const betaR = TOTAL_RAYLEIGH.clone().multiplyScalar(rayleighCoefficient);
  const betaM = totalMie(a.turbidity, a.mieCoefficient);

  // optical depth
  const zenithAngle = Math.acos(Math.max(0, dir.y));
  const inverse =
    1 /
    (Math.cos(zenithAngle) +
      0.15 * Math.pow(93.885 - (zenithAngle * 180) / Math.PI, -1.253));
  const sR = RAYLEIGH_ZENITH * inverse;
  const sM = MIE_ZENITH * inverse;

  const fex = new THREE.Vector3(
    Math.exp(-(betaR.x * sR + betaM.x * sM)),
    Math.exp(-(betaR.y * sR + betaM.y * sM)),
    Math.exp(-(betaR.z * sR + betaM.z * sM)),
  );

  const cosTheta = dir.dot(sunDir);
  const rPhase = rayleighPhase(cosTheta * 0.5 + 0.5);
  const mPhase = hgPhase(cosTheta, a.mieDirectionalG);
  const betaTotal = new THREE.Vector3(
    (betaR.x * rPhase + betaM.x * mPhase) / (betaR.x + betaM.x),
    (betaR.y * rPhase + betaM.y * mPhase) / (betaR.y + betaM.y),
    (betaR.z * rPhase + betaM.z * mPhase) / (betaR.z + betaM.z),
  );

  const lin = new THREE.Vector3(
    Math.pow(sunE * betaTotal.x * (1 - fex.x), 1.5),
    Math.pow(sunE * betaTotal.y * (1 - fex.y), 1.5),
    Math.pow(sunE * betaTotal.z * (1 - fex.z), 1.5),
  );
  const horizonMix = clamp(Math.pow(1 - sunDir.y, 5), 0, 1);
  lin.set(
    lin.x * THREE.MathUtils.lerp(1, Math.pow(sunE * betaTotal.x * fex.x, 0.5), horizonMix),
    lin.y * THREE.MathUtils.lerp(1, Math.pow(sunE * betaTotal.y * fex.y, 0.5), horizonMix),
    lin.z * THREE.MathUtils.lerp(1, Math.pow(sunE * betaTotal.z * fex.z, 0.5), horizonMix),
  );

  // night sky base (no sun disc in the JS sampler — fog never contains it)
  const l0 = fex.clone().multiplyScalar(0.1);

  const tex = new THREE.Vector3(
    (lin.x + l0.x) * 0.04,
    (lin.y + l0.y) * 0.04 + 0.0003,
    (lin.z + l0.z) * 0.04 + 0.00075,
  );

  // Exposure AFTER the Preetham gamma — exactly like the dome shader.
  const gamma = 1 / (1.2 + 1.2 * sunfade);
  const col = new THREE.Vector3(
    Math.pow(tex.x, gamma) * a.exposure,
    Math.pow(tex.y, gamma) * a.exposure,
    Math.pow(tex.z, gamma) * a.exposure,
  );

  // ---- weather + moon, identical to the dome shader ----
  const lum = col.x * 0.2126 + col.y * 0.7152 + col.z * 0.0722;
  // filmic vibrance (matches the dome)
  col.set(
    Math.max(0, lum + (col.x - lum) * 1.5),
    Math.max(0, lum + (col.y - lum) * 1.5),
    Math.max(0, lum + (col.z - lum) * 1.5),
  );
  const overcastCol = new THREE.Vector3(lum * 0.92, lum * 0.96, lum * 1.0);
  col.lerp(overcastCol, clamp(a.overcast, 0, 1));
  const mood = new THREE.Vector3(...a.moodColor).multiplyScalar(0.35 + lum);
  col.lerp(mood, clamp(a.moodMix, 0, 1));

  if (a.moonE > 0.0001) {
    const cosMoon = dir.dot(moonDir);
    const mrPhase = rayleighPhase(cosMoon * 0.5 + 0.5);
    const denom = new THREE.Vector3(
      betaR.x + betaM.x,
      betaR.y + betaM.y,
      betaR.z + betaM.z,
    );
    col.x += a.moonE * ((TOTAL_RAYLEIGH.x * mrPhase) / denom.x) * (1 - fex.x) * 0.5;
    col.y += a.moonE * ((TOTAL_RAYLEIGH.y * mrPhase) / denom.y) * (1 - fex.y) * 0.62;
    col.z += a.moonE * ((TOTAL_RAYLEIGH.z * mrPhase) / denom.z) * (1 - fex.z) * 0.9;
  }

  return new THREE.Color(
    clamp(col.x, 0, 1.5),
    clamp(col.y, 0, 1.5),
    clamp(col.z, 0, 1.5),
  );
}

/**
 * Color of direct sunlight after traveling through the atmosphere at the
 * given sun direction (transmittance) — naturally white at noon, amber at the
 * horizon. Normalized so light INTENSITY stays a separate control.
 */
export function sunTransmittance(sunDir: THREE.Vector3, a: Atmosphere): THREE.Color {
  const betaR = TOTAL_RAYLEIGH.clone().multiplyScalar(Math.max(0.2, a.rayleigh));
  const betaM = totalMie(a.turbidity, a.mieCoefficient);
  const zenithAngle = Math.acos(clamp(Math.max(0.02, sunDir.y), -1, 1));
  const inverse =
    1 /
    (Math.cos(zenithAngle) +
      0.15 * Math.pow(93.885 - (zenithAngle * 180) / Math.PI, -1.253));
  const sR = RAYLEIGH_ZENITH * inverse;
  const sM = MIE_ZENITH * inverse;
  const r = Math.exp(-(betaR.x * sR + betaM.x * sM));
  const g = Math.exp(-(betaR.y * sR + betaM.y * sM));
  const b = Math.exp(-(betaR.z * sR + betaM.z * sM));
  const m = Math.max(r, g, b, 1e-4);
  return new THREE.Color(r / m, g / m, b / m);
}

/** Linear color -> sRGB hex string (for SceneParams). */
export function linearToHex(c: THREE.Color): string {
  return "#" + c.clone().convertLinearToSRGB().getHexString();
}
