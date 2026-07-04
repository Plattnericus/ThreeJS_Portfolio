// Shared GLSL chunks used across the vegetation/terrain materials so the same
// effect never drifts between copies (Tree leaves, Grass, GrassClumps, Island).

// Drifting cloud-shadow term. Requirements in the host shader:
//   uniforms: uTime (float), uWindDir (vec2), uCloudCover (float 0..1)
//   varying:  vWPos (vec3 world position, written by the vertex stage)
// Cheap 2-band interference pattern over world XZ that drifts with the wind —
// reads as cumulus shadows sliding over the island. Multiply into the albedo
// BEFORE lighting so shaded spots still catch rim/sky light.
export const CLOUD_SHADOW_FRAG = `
{
  vec2 cuv = vWPos.xz * 0.055 + normalize(uWindDir) * uTime * 0.02;
  float cl = sin(cuv.x * 2.1) * sin(cuv.y * 1.7)
           + 0.5 * sin(cuv.x * 4.3 + 1.7) * sin(cuv.y * 3.9 + 0.4);
  float cloudShadow = 1.0 - uCloudCover * 0.45 * smoothstep(-0.2, 0.9, cl);
  diffuseColor.rgb *= cloudShadow;
}
`;
