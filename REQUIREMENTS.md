# Requirements & Asset Checklist

What the project needs you (or an artist / Sketchfab) to provide so the scene, seasons, shaders, and
motion all work. Tick items off as they're sourced. Specs here exist so you pick the **right** models
the first time.

---

## 1. Universal model specs (apply to every asset)

- [ ] Format **`.glb`** (single file), low-poly, **flat-shaded** look.
- [ ] **+Y up**, base / floor at the **origin (`y = 0`)**.
- [ ] Real-world-ish scale in **meters** (a house ≈ 2–4 units tall) so pieces fit together.
- [ ] **Clean, separable meshes** with sensible names (so we can tint / animate parts).
- [ ] Draco or meshopt compressed; **no 4K textures** — prefer vertex color or tiny palette textures.
- [ ] License is **reuse-friendly** (e.g. CC-BY / CC0) and the credit is added to `CREDITS.md`.

---

## 2. Tree assets (the family tree)

The tree is modular so it can grow. Either a kit of parts **or** one model we can scale/instance.

- [ ] **Trunk** — bare, low-poly, vertical. Must look good with **no leaves** (zero-star sapling).
- [ ] **Branch** segment(s) — to extend/append growth (or a trunk that reads well when scaled).
- [ ] **Leaf** — a single leaf (or small leaf cluster) we **instance hundreds of**.
      - [ ] Leaf material must be **tintable from one color uniform** (for seasonal hue) — i.e. light
            geometry, no baked-in green texture that fights tinting.
- [ ] Optional: **blossom** variant (spring) and **frost/snow leaf** look (winter) — or we recolor.

> **Have:** `tree.glb` (optimized 12.5MB, separable bark/leaf meshes). Growth is faked via a vertical
> reveal shader + leaf-cluster reveal (see CLAUDE.md → "Making the hero tree grow").
> **Still needed for TRUE per-star leaves:** a **single-leaf** `.glb` to instance one-per-stargazer.
> Without it, foliage reveals in clusters (coarse), not one leaf per star.

> If buying one tree model: pick one with the **trunk and foliage as separate meshes** so we can hide
> leaves at 0 stars and tint them per season.

---

## 3. House assets (one per rarity tier)

Five visually distinct, escalating low-poly houses. Same footprint/scale family so swapping by tier
looks consistent.

- [ ] `house_common`
- [ ] `house_uncommon`
- [ ] `house_rare`
- [ ] `house_epic`
- [ ] `house_legendary`

- [ ] Each sits with its **floor at `y = 0`**, faces **+Z**, similar base size.
- [ ] Rarity reads at a glance (size / detail / accent color escalates Common → Legendary).

---

## 4. Environment / weather

> **Have:** `island.glb` (floating island base, 11.25MB, centered). Textures were missing — assign
> low-poly flat materials in code. The tree + houses plant on its top surface.

Can be code/shader-generated (preferred) — listed so it's not forgotten.

- [ ] **Low-poly flat materials for the island** (ground green, rock greys) — replaces missing maps.
- [ ] **Ground / terrain** handled by the island surface (shader adds snow blend in winter).
- [ ] **Sky** — gradient shader (no asset needed) with seasonal color uniforms.
- [ ] **Weather particles** — snow / falling leaves / petals (instanced, shader-driven; a tiny
      sprite or simple geo is enough).

---

## 5. Shader / material requirements (engineering — no purchase, just must-haves)

- [ ] Leaf **wind-sway** vertex shader + **seasonal tint uniform**.
- [ ] Ground **snow-blend** shader (winter).
- [ ] Gradient **sky** shader with seasonal color uniforms.
- [ ] Centralized uniforms: `time`, `season`, `windStrength`.
- [ ] Custom materials extend standard lighting (`onBeforeCompile`/`shaderMaterial`) so shadows work.

---

## 6. Motion requirements (engineering)

- [ ] Tree **grow-in** intro animation; per-node **pop-in** when new stars arrive.
- [ ] Idle leaf sway / branch flex.
- [ ] Eased inertial **orbit camera** + focus-on-house dolly.
- [ ] Shared easing/spring config for all UI transitions.
- [ ] Everything honors **`prefers-reduced-motion`**.

---

## 7. Data / config (non-art)

- [ ] **Tracked repo** decided — `owner/name` (which repo's stars drive the tree?).
- [ ] **GitHub token** in env (`GITHUB_TOKEN`) for higher rate limits (server-side only).
- [ ] Decide live-vs-cached strategy for **contributor enrichment** (rarity bonus).
- [ ] Final **rarity weights/thresholds** calibrated against the real stargazer set.
- [ ] Season → month mapping confirmed (hemisphere).

---

### How to register what you add
- 3D files → drop in `public/models/`, list in `public/models/models.json`.
- Attributions → add a row to `CREDITS.md` (the site reads it live).
