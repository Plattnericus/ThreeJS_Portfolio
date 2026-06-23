// Deterministic placeholder stargazer handle per house index. Until real
// stargazer logins are wired in, this gives every house a stable, searchable
// name (and the search bar + 3D scene agree because they share this function).

const A = [
  "octo",
  "luna",
  "pixel",
  "nova",
  "fern",
  "koda",
  "echo",
  "wren",
  "sol",
  "bramble",
  "miko",
  "tilde",
  "juno",
  "wisp",
  "cedar",
  "lumen",
];
const B = ["dev", "cat", "byte", "leaf", "star", "fox", "moss", "wave"];

export function nameForIndex(i: number): string {
  return `${A[i % A.length]}-${B[(i * 3) % B.length]}${i}`;
}
