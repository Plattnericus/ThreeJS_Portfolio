# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Status: greenfield / planning.** The repo currently contains only `README.md` and
> `.gitattributes`. Nothing below has been built yet — this document is the agreed product and
> technical plan. Keep it updated as the project is scaffolded and decisions firm up.

## The Idea

A living, low-poly 3D "GitHub Star Tree." A single tracked repository's GitHub stars drive a tree
that **grows as it gains stars**. **Every stargazer becomes a house** placed on/around the tree, and
each house has a **rarity tier** derived from that stargazer's standing. The more stars the repo has,
the bigger the tree and the denser the little village of houses around it.

The site is a personal portfolio piece: a fun, shareable, real-time visualization of community
support for one of the user's projects.

## Locked-In Decisions

These were chosen explicitly. Do not silently change them.

| Area            | Decision                                                                 |
| --------------- | ------------------------------------------------------------------------ |
| Framework       | **Next.js** (App Router)                                                  |
| 3D layer        | **react-three-fiber** + **@react-three/drei** (declarative, state-driven) |
| Data source     | **One repo, live via API** — track a single chosen repo's stargazers, fetched through a Next.js route with caching/ISR |
| Models          | **Pre-made GLTF/GLB low-poly assets** (tree + per-rarity houses), loaded via drei `useGLTF` |
| Rarity driver   | **Stargazer "clout" + contributor bonus** (see Rarity System below)      |
| Interaction     | Click house → stargazer profile panel; hover tooltips; free orbit/zoom/pan camera; rarity legend + stats HUD |
| Deployment      | **Vercel** (ISR + edge caching for the API route, env-based token)        |
| 2D UI / styling | **Tailwind CSS** for all HUD/panels/overlays                              |

## Rarity System (design)

Each house's rarity is a **score** computed from the stargazer, then bucketed into tiers. The score
blends the stargazer's own "clout" with a bonus if they also *contributed* to the tracked repo.

Proposed score formula (tune the weights during build):

```
clout   = w_followers * log10(followers + 1)
        + w_age       * accountAgeYears
        + w_repos     * log10(publicRepos + 1)

contributorBonus = isContributor ? (B_base + B_perCommit * log10(commits + 1)) : 0
                   + isForker     ? B_fork  : 0
                   + openedIssues  ? B_issue : 0

rarityScore = clout + contributorBonus
```

Bucket `rarityScore` into tiers (drop-rate / threshold table to be finalized):

| Tier      | Meaning                                  | House asset      |
| --------- | ---------------------------------------- | ---------------- |
| Common    | Low clout, no contribution               | `house_common`   |
| Uncommon  | Some clout                               | `house_uncommon` |
| Rare      | Notable clout **or** contributor         | `house_rare`     |
| Epic      | High clout **and** contributor           | `house_epic`     |
| Legendary | Top-tier clout + significant contributor | `house_legendary`|

**Open implementation questions to resolve when building:**
- Contributor data requires extra GitHub calls (`/contributors`, per-user commit counts). Decide
  whether to compute the bonus live or precompute it on a schedule and cache.
- Final weights/thresholds (`w_*`, `B_*`) should be calibrated against the real stargazer set so the
  tier distribution feels good (legendaries should stay rare).
- Tiers should be **deterministic** per user (same stargazer always gets the same house) — seed any
  randomness (e.g. house position/variant) from the user id.

## Location & Live Weather — Sterzing (Vipiteno), South Tyrol, Italy

> **IMPLEMENTED (first pass).** `/api/weather` fetches live Open-Meteo data for Sterzing;
> `lib/weather.ts` maps it (exaggerated) to `SceneParams` (sun pos/intensity/color, sky+fog color,
> ambient, wind, precip). `components/Weather.tsx` renders rain/snow particles; `SettingsMenu.tsx`
> toggles live↔manual with a time-of-day slider + conditions (clear/clouds/fog/rain/snow/storm).
> Wind drives leaf sway + whole-tree sway + house bob. Day/night from local hour. `components/
> SceneRig.tsx` eases background/fog/lights so weather & time changes fade smoothly. Seasonal foliage
> tint (`lib/weather.ts` LEAF_COLOR by calendar season) + snow accumulation on the island's up-facing
> surfaces (`uSnow` in the grass shader) + frosted leaves. Remaining polish: snow on house roofs,
> autumn falling-leaf particles, real organic growth (needs morph-target tree .glb).


The scene should mirror the **real-time, real-world weather** of **Sterzing / Vipiteno, South Tyrol,
Italy** (≈ 46.897° N, 11.430° E) — but **slightly exaggerated / "overstimulated"** so it reads
clearly on screen. If it's sunny+windy there, the site is bright with strong leaf sway; if it's
snowing, snow falls harder than reality; overcast → moody grey, etc.

- **Data source:** Open-Meteo (`https://api.open-meteo.com/v1/forecast?latitude=46.897&longitude=11.43&current=temperature_2m,weather_code,wind_speed_10m,cloud_cover,is_day`).
  Free, no API key. Fetch via a Next.js route (`/api/weather`) with short revalidate (~10 min).
- **Map weather → scene** (then exaggerate by ~1.3–1.6×):
  - `cloud_cover` → sky greyness, sun intensity, fog density.
  - `wind_speed_10m` → leaf/branch sway amplitude + speed, particle drift.
  - `weather_code` → rain / snow / clear particle system.
  - `is_day` + local time → sun position / day-night tint.
  - `temperature_2m` → seasonal hint (cool palette when cold).
- **Settings menu (HUD):** a small panel to **override** time-of-day and season/weather for fun/demo
  (Live ↔ Manual). Live = follow Sterzing; Manual = pick time + weather. Useful for testing winter
  in summer. Keep it minimal and on-palette.
- **Realism goal:** the user wants it to *look real* (real tree, grass-textured island, nice
  real-time shaders) while staying performant — see "Realism notes" below.

## Realism notes (aspiration vs. asset reality)

The current hero `tree.glb` is a **stylized Sketchfab tree**, not photoreal — true photorealism would
need a different asset (scanned/PBR tree) + bigger GPU budget. Pragmatic realism levers we CAN pull:
- **PBR-ish lighting:** drei `<Environment>` HDRI + soft directional sun + contact shadows + mild
  tone mapping (ACES). Avoid heavy bloom.
- **Grass-textured island:** replace the flat tan material with a **grass/rock shader** (triplanar
  noise blend: green grass on up-facing slopes, rock on steep faces) since the original textures were
  missing. Add subtle normal/`roughness` variation. Optional instanced grass blades on top for a
  closer look.
- **Wind shader** on leaves + grass driven by the live wind value.
- Keep one hero scene; don't add many high-poly meshes (island ≈2M + tree ≈0.9M is already heavy).

## Real Tree Growth — what's needed for ONE model to grow for real

User wants the tree to **start as a small branch/sapling and genuinely grow bigger over time** from
**one model, automatically** (not thousands of stage models). Options, best first:

1. **Morph targets / shape keys (recommended).** Author the tree once in Blender with 2–3 **shape
   keys**: `sapling → young → full`, same topology. Export as one `.glb` (morph targets travel in the
   file). Code morphs `influence` by star count → the *shape itself* changes (branches extend/thicken)
   automatically. **This is the "one model, grows for real, automatic" answer.**
   - *What I need from you:* a tree `.glb` with morph targets named (e.g.) `grow0/grow1/grow2`, or the
     `.blend` so the shapes can be added. Same vertex count across shapes.
2. **Skeleton + pose animation.** Rig the tree with bones; a single "growth" animation clip from
   sapling→full; scrub the clip by star count. One model, real bending growth. More rigging effort.
3. **Procedural L-system tree (no model).** Generate the tree in code so it literally grows branch by
   branch. Most "alive", but it replaces the Sketchfab model.
4. **Current fallback (no new asset):** scale + a vertical reveal shader on the static full tree —
   one model, automatic, but it's uniform scaling, not organic limb growth.

Until a morph-target/rigged tree exists, the site uses option 4. Drop a morph-target `.glb` in
`public/models/` and growth becomes genuinely organic with no other change.

## Village Houses on Branches (rarity)

Every stargazer gets **one house from the village pack** (`casual_village_buildings_pack.glb`),
perched on a **small floating island on a tree branch**. The pack has 4 buildings (+ a Circle base);
all sit at the origin in the file, so we extract each by mesh name and place individually.

- **Rarity = which building.** Conceptually left→right = common→legendary. Mapping (prototype):
  `common → FarmCarrot`, `uncommon → FishermanMarket`, `rare → ForgeHouse`, `legendary → Barracks`.
  (Final tier still derives from stargazer clout + contributor bonus.)
- Each house sits on a **mini floating island disc** (grass top, tapered rock bottom) attached near a
  **branch tip**, with a gentle bob. Deterministic placement (golden-angle), founders higher.
- One house per star; expect ~10, so keep counts modest.

## The Floating Island (base)

The whole scene sits on a **floating island** — `public/models/island.glb` (Blender OBJ → glb,
centered at origin, optimized **84MB → 11.25MB**). The tree grows from the top of the island; houses
sit on its surface; below it is open sky (it floats). Notes:
- **Centered at origin**, roughly ±13.6 in X/Z, ±9.5 in Y. Place the tree at the island's **top
  surface** and parent houses/tree to the island so the whole thing can drift/bob as one.
- **Textures are missing** — the source `.mtl` referenced Windows `C:/...` paths that weren't in the
  archive, so it loads with **base material colors only**. This is actually fine for the low-poly
  look: **assign our own flat, on-palette materials in code** (ground green, rock greys) rather than
  hunting for the originals. Matches the Art Direction.
- It's a **static mesh** (~2M verts after conversion). Combined with the tree it's heavy-ish but OK
  for one hero scene; keep an eye on the frame budget and don't add many more high-poly meshes.
- Optional motion: a slow vertical **bob** + faint rotation on the island makes the "floating" read.

## Tree Growth (design)

The tree is a **family tree**. It starts as a bare sapling and grows **upward** over time; the
**earliest stargazers are the founders and live at the top (the crown)**, never displaced. Each new
star extends the tree downward/outward with newer growth, so the silhouette gets taller and fuller
as support accrues — you can read the project's history by looking up the tree.

**Core rules:**
- **Zero stars = bare sapling.** A thin trunk, **no leaves**, no houses. Deliberately small and
  humble.
- **Stargazers are ordered by star date.** Rank 0 = first ever star. This ordering is the tree's
  spine and must be **stable** — the founders stay put as the tree grows.
- **First stars on top.** Map rank → height so rank 0 sits at the crown and the newest star sits at
  the current bottom/outer edge. New growth appends; it does not reshuffle existing nodes.
- **Each star adds a leaf.** Leaf count == stargazer count. A bare trunk gains foliage as stars come
  in. (No stars → no leaves, exactly as requested.)
- **Each stargazer also gets a house** at their node, with a model chosen by **rarity tier** (see
  Rarity System). Leaf + house belong to the same stargazer node.
- **The tree scales with total stars** — height, trunk thickness, and branch count grow as a
  function of total count, so milestones (10 / 100 / 1k stars) feel visibly bigger.
- **Deterministic placement.** A node's exact branch, angle, and house variant are seeded from the
  stargazer id so the scene is identical across reloads and never visually overlaps. Use a
  golden-angle (phyllotaxis) spiral around the trunk for natural, non-clumping distribution.

### Making the hero tree "grow" (it's a static mesh — no rig)

`public/models/tree.glb` is a single, finished Sketchfab tree (optimized 81MB → **12.5MB**, meshopt +
webp; `tree.original.glb` is the backup). It has **no skeleton/animation**, but its **bark and leaf
meshes are separate**, which is what makes faked growth look good. Layered technique, from cheapest
to most convincing:

1. **Vertical reveal shader (primary "grow up" effect).** Extend the material via `onBeforeCompile`
   with a `uGrowth` uniform (0→1). In the fragment shader, `discard` fragments whose world-Y is above
   `uGrowth * treeHeight` (tree height ≈ 10.6 units, base at y≈0). Drive `uGrowth` 0→1 with a spring
   on load → the tree appears to **sprout upward from the ground**. Add a subtle vertical
   squash-and-stretch for life.
2. **Leaf-cluster reveal tied to stars (the "more stars = more leaves").** Because leaf meshes are
   separate (`Leaf*`), keep them hidden for the bare sapling and **scale each leaf cluster in from 0**
   (spring) as star milestones are hit. Reveal order = star order, so foliage fills in over time.
3. **Overall scale with total stars.** Uniform-scale the whole tree as a function of total star count
   so milestones feel bigger.

**Granularity caveat:** this model's leaves are large **clustered cards**, not individual leaves — so
"one leaf per single star" isn't literal with this asset. Two honest options:
- **Coarse:** reveal canopy in chunks (per leaf cluster) — no new assets.
- **True per-star leaves:** add a separate **single-leaf** instanced asset and place one per
  stargazer node (matches the family-tree spec exactly). Recommended if per-star granularity matters.

**Only path to *literal* organic growth** (trunk thickening, branches extending) = re-author in
Blender (bones / shape keys / Geometry Nodes / L-system) or generate a procedural tree. Big effort;
the reveal-shader + cluster approach above is the pragmatic choice for a portfolio.

### Asset optimization (reuse this pipeline)

Heavy Sketchfab GLBs must be compressed before shipping. The pass that worked here (no visible
quality loss): `gltf-transform optimize <in> <out> --compress meshopt --texture-compress webp`
(leave `--simplify` **off** — it mangles leaf cards for almost no vertex savings on this model).

**Suggested model:** treat the trunk as a vertical spine of height `H(totalStars)`. A stargazer of
rank `r` (0-based) out of `N` total sits at normalized height `1 - r/N` (founders high, newest low),
offset onto a branch by a golden-angle around the trunk. Leaves cluster near each node. As `N` and
`H` grow, existing nodes keep their **rank-relative** height, so the founders' crown rises with the
tree rather than getting buried.

## Motion & Shaders

The site should feel **alive and crafted** — motion and custom shaders carry the polish, but stay
**on-palette and restrained** per the Art Direction rules (tasteful, not a demo reel).

**Motion graphics**
- **Intro / growth animation:** the tree grows in on first load (trunk rises, branches unfold, leaves
  pop in by rank). When new stars arrive, the corresponding leaf + house **animate in** rather than
  appearing instantly.
- **Idle life:** slow leaf sway, gentle branch flex, subtle house "settle." Looping, low-amplitude.
- **Camera:** eased, inertial orbit; smooth focus transitions when a house is clicked (dolly to it).
- **UI transitions:** HUD panels/tooltips fade+slide with short, consistent easing. One spring/easing
  config shared across the app — no mismatched timings.
- Use **springs** (e.g. `@react-spring/three`) and/or GSAP for sequencing; drive per-frame motion in
  `useFrame`. Everything respects `prefers-reduced-motion`.

**Shaders (GLSL / custom materials)**
- **Leaves:** custom vertex displacement for **wind sway** (driven by time + position), plus subtle
  per-leaf color variation. The leaf material is **tintable by season** (one uniform drives the
  seasonal hue). Prefer instanced leaves with a shared `ShaderMaterial`/`onBeforeCompile`.
- **Ground / snow:** a shader-blended ground that transitions to **snow cover in winter** (height/
  noise-based blend), with a faint sparkle in winter only.
- **Sky/background:** a soft gradient sky shader whose colors are seasonal uniforms (no texture).
- **Weather particles:** GPU-friendly instanced snow / leaves / petals with shader-driven drift.
- **Optional accents:** light fresnel rim on houses, gentle ambient occlusion. **No heavy bloom, no
  chromatic aberration, no lens flares.**
- Implement via `@react-three/drei` helpers (e.g. `shaderMaterial`) or `onBeforeCompile` to extend
  standard materials so lighting/shadows still work. Keep uniforms centralized (time, season, wind).

**Performance budget:** instance leaves/houses/particles; keep draw calls low; clamp particle counts;
pause `useFrame` work when the tab is hidden. Target a smooth 60fps on a mid laptop.

## Seasons (real-world calendar)

The scene reflects the **current real-world season** (derived from the visitor's date). The tree and
environment re-skin themselves; growth, ranks, and houses are unaffected — only the look/weather
changes.

| Season | Foliage / tree                                  | Sky / light                | Weather effect            |
| ------ | ----------------------------------------------- | -------------------------- | ------------------------- |
| Spring | fresh light greens, optional blossom on nodes   | bright, soft warm light    | occasional drifting petals|
| Summer | full, deep greens                               | bright, high key light     | none (calm), warm haze    |
| Autumn | orange/red/brown leaf tints                     | warm, lower golden light   | falling leaves            |
| Winter | **bare or frosted** leaves, snow on branches    | cool, dim, blue-grey light | **snowfall**              |

**Rules:**
- **Source of truth:** compute season from the current date. Default to **Northern-Hemisphere**
  months (Dec–Feb winter, etc.); keep the season→date mapping in one small config so it's easy to
  flip hemisphere or hard-set a season for testing (e.g. `?season=winter` query param).
- **What changes:** leaf material color/tint, ground tint (snow cover in winter), sky/background
  color, key-light color + intensity, and an active **weather particle system** (snow / leaves /
  petals). Snow can also lightly accumulate on branch/house tops in winter.
- **What does NOT change:** stargazer ranks, tree height/size logic, house tiers, placement. Seasons
  are a **skin** over the same structure.
- **Style discipline:** weather stays subtle and on-palette per the Art Direction rules — gentle
  particle counts, soft motion, `prefers-reduced-motion` disables or reduces it. No blizzard, no
  heavy bloom.
- **Implementation:** keep a `Season` type + a palette/lighting/weather lookup table; the `<Scene>`
  reads the active season and feeds those values to materials, lights, and the weather system. Make
  it overridable so QA and demos can force any season.

## Art Direction (avoid generic-looking UI)

The look should feel **deliberate and calm**, not like a default template. Concrete rules so the
build doesn't drift into visual cliché:

**3D scene**
- **Low-poly, flat-shaded** geometry with a **small, hand-picked palette** (one bark tone, two-to-
  three foliage greens, warm house accents). No photoreal textures, no PBR metal/rough sliders.
- **Soft single key light + gentle ambient/hemisphere fill.** One direction of light, soft contact
  shadows. Avoid harsh multi-light setups.
- **Calm background:** a flat or subtly graduated sky color that complements the palette — **no
  starfield, no neon gradients, no animated noise**.
- **Restrained motion:** slow idle sway on leaves, smooth eased camera. No bouncing, no spinning
  logos, no particles-for-the-sake-of-it.
- Optional, subtle postprocessing only: light ambient occlusion and a touch of vignette. **No heavy
  bloom.**

**2D overlay (Tailwind)**
- **One** clean sans typeface; a clear type scale. Generous whitespace. Left-aligned text.
- **Minimal chrome:** thin borders or soft shadows, not stacked glassmorphism/blur panels. Pick
  **one** accent color (ideally pulled from the foliage palette) and use it sparingly.
- HUD sits at the screen edges and stays out of the way; panels open on demand, not all at once.
- **No emoji in the product UI, no gratuitous gradients, no generic hero buzzwords.** Labels are
  short and concrete ("1,204 stars", "Legendary ×3").
- Respect `prefers-reduced-motion`; keep it accessible and readable.

A short, restrained palette + lighting choice carries this aesthetic more than any effect — decide
the palette early and apply it consistently across scene and HUD.

## Models Folder

> **See `REQUIREMENTS.md`** (repo root) for the full asset + shader + motion checklist — exactly
> what models/specs to source before building.

Runtime 3D assets live in **`public/models/`**:
- Drop `.glb`/`.gltf` files into that folder (see `public/models/README.md`).
- Register each asset in **`public/models/models.json`** (keys for `tree.trunk`, `tree.leaf`, and
  `houses.<tier>`). The scene loads models **by key from this manifest**, so swapping a model is a
  file drop + a manifest edit — no code change.
- Model to **+Y up**, base/floor at `y = 0`, low-poly, Draco/meshopt compressed. Consider `gltfjsx`
  to generate typed components from the GLBs.

## Intended Architecture

> None of this exists yet — this is the target shape. Adjust as reality dictates and keep this
> section honest.

```
app/
  page.tsx                 # Landing — mounts the 3D <Scene/> + 2D HUD overlay
  api/
    stargazers/route.ts    # Server route: fetch + score + cache stargazers for the tracked repo
layers:
  - Scene (react-three-fiber <Canvas>)
      Tree           # scales with total stars
      HouseField     # maps scored stargazers -> positioned Houses
      House          # loads rarity-specific GLTF, raycast click/hover targets
      Lighting/Env   # drei <Environment>, low-poly flat-ish lighting
      Camera         # drei <OrbitControls>
  - HUD (Tailwind, plain DOM over the canvas)
      StatsHud       # total stars, tier breakdown
      RarityLegend
      StargazerPanel # opens on house click
      Tooltip        # follows hovered house
data flow:
  GitHub API --> /api/stargazers (fetch, dedupe, score, tier) --> ISR cache
            --> client fetch/SWR --> R3F scene + HUD
```

**Key architectural intents:**
- **Scoring/tiering happens server-side** in the API route, never in the browser — keeps the token
  secret and the client payload small (avatar, login, profile url, tier, seed).
- The browser receives a **pre-scored, render-ready list**; the scene is a pure function of that
  data plus total star count.
- GitHub token lives in an **env var** (e.g. `GITHUB_TOKEN`) and is read only server-side. Never
  ship it to the client. The tracked repo (`owner/name`) is config (env or constant).
- Stargazer list can be large → **paginate** the GitHub API and **cache** the result (ISR
  `revalidate`, or a cached fetch) to respect rate limits.

## Commands

_No tooling is set up yet._ Once scaffolded (recommended: `npx create-next-app@latest` with
TypeScript + Tailwind + App Router), the standard scripts will be:

```bash
npm run dev      # local dev server
npm run build    # production build
npm run start    # serve production build
npm run lint     # eslint
```

Update this section with the real scripts (and any test runner) once `package.json` exists.

## Build Order (suggested milestones)

1. **Scaffold** Next.js (App Router, TS, Tailwind) + add `three`, `@react-three/fiber`,
   `@react-three/drei`.
2. **Static scene** — `<Canvas>`, lighting, OrbitControls, a single placeholder low-poly tree GLTF.
3. **GitHub API route** — fetch stargazers for one repo (token in env), paginate, return JSON.
4. **HouseField** — render N houses around the tree from the stargazer list, deterministic placement.
5. **Tree growth** — scale tree/foliage from total star count.
6. **Rarity scoring** — implement the score → tier mapping in the API route; swap house GLTF by tier.
7. **Interaction** — raycast click → StargazerPanel, hover → Tooltip.
8. **HUD** — StatsHud + RarityLegend in Tailwind.
9. **Contributor bonus** — add contributor/fork/issue signals to the score (decide live vs cached).
10. **Polish + deploy** to Vercel (env vars, ISR tuning, postprocessing/AO if wanted).

## Live Credits (CREDITS.md)

`CREDITS.md` (repo root) is the **single source of truth for 3D model / asset attributions**, edited
by hand. The website **reads and parses it live** and renders a Credits panel from it — adding a
credit means editing the markdown table, no code change.

**Contract for the parser/build:**
- The file holds a markdown table with columns: `Model | Author | Source | License`.
- Parse **only** lines starting with `|`; skip the header row, the `| --- |` separator, blank lines,
  and the leading HTML comment block (it's the human instructions).
- `Model` and `Source` are required per row; `Author`/`License` may be empty (keep the pipes).
- Render `Source` as a clickable link; a row is just `{ model, author, source, license }`.

**Implementation intent:**
- Read the file server-side (e.g. `fs.readFile` in a Server Component or a `/api/credits` route, or
  import as raw text) so it's parsed at request/build time — **do not** fetch the raw file from the
  client.
- A tiny hand-rolled split-on-`|` parser is enough; no markdown lib needed. Trim cells.
- If a row is malformed, skip it gracefully rather than crashing the page.
- Surface it in the UI as a "Credits" entry in the HUD (small button → panel listing all assets).

## Conventions & Gotchas (fill in as you go)

- **Asset pipeline:** store GLTF/GLB under `public/models/`; consider `gltfjsx` to generate typed
  components and `meshopt`/draco compression for low-poly assets.
- **Determinism:** any per-stargazer randomness (position, house variant) must be seeded from a
  stable id so the scene doesn't reshuffle on every load.
- **Rate limits:** authenticated GitHub REST = 5k req/hr; stargazer + contributor enrichment can be
  call-heavy. Cache aggressively. Consider GraphQL to batch fields.
- **SSR/Three.js:** the `<Canvas>` and anything touching `window`/WebGL must be client-only
  (`'use client'`, and dynamic import with `ssr: false` where needed).
