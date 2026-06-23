# Drop your 3D models here

This is the asset folder. Put your `.glb` / `.gltf` files **in this folder**, then register each one
in `models.json` (next to this file). The website loads models from that manifest — so once a file is
here and listed in `models.json`, the scene can use it. No code edit needed to swap a model.

## Steps to add a model

1. Export/download a **low-poly** model as `.glb` (preferred — single file) or `.gltf`.
2. Copy it into this folder, e.g. `public/models/tree_trunk.glb`.
3. Add an entry to `models.json` pointing at the file (see that file for the format).
4. Reload the site.

## Conventions

- **Format:** `.glb` preferred. Keep it low-poly; compress with Draco/meshopt if large.
- **Naming:** lowercase, snake_case, descriptive — `tree_trunk.glb`, `house_rare.glb`, `leaf.glb`.
- **Scale/orientation:** model the tree growing **+Y up**, base at the origin (`y = 0`). Houses
  should sit with their floor at `y = 0` too, so placement code doesn't have to guess offsets.
- **Don't commit huge source files** (`.blend`, 4K textures) here — only the optimized runtime asset.
