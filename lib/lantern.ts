import * as THREE from "three";

// One uniform lantern size everywhere (decks + bridges) so they all match.
export const LANTERN_SIZE = 1.15;

// Clone the lantern model, make it glow warmly (emissive), and normalize it to
// `target` (by its largest dimension) with the base at y=0. `rotX` lets callers
// correct the model's up-axis.
export function buildLantern(
  scene: THREE.Object3D,
  target = 0.7,
  rotX = 0,
  emissive = 1.6,
): THREE.Group {
  const inner = scene.clone(true);
  inner.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const m = (o.material as THREE.MeshStandardMaterial).clone();
      m.emissive = new THREE.Color("#ffb14d");
      m.emissiveIntensity = emissive;
      o.material = m;
      o.castShadow = true;
    }
  });
  if (rotX) inner.rotation.x = rotX;
  inner.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(inner);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  const g = new THREE.Group();
  g.add(inner);
  g.scale.setScalar(target / (Math.max(size.x, size.y, size.z) || 1));
  inner.position.set(-center.x, -box.min.y, -center.z);
  return g;
}
