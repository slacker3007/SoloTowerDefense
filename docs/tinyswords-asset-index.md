# TinySwords Asset Index

This document tracks discovered TinySwords assets in this repository and points to a full path manifest for reuse in implementation.

## Scan scope

- Root scanned: `TinySwords/`
- Included extensions: `.png`, `.aseprite`, `.ase`, `.jpg`, `.jpeg`, `.webp`, `.gif`
- Excluded: non-asset metadata files (for example `.DS_Store`)

## Totals

- Total discovered assets: `428`
- `.png`: `410`
- `.aseprite`: `18`

## Top-level asset groups

- `TinySwords/Buildings`
- `TinySwords/Particle FX`
- `TinySwords/Terrain`
- `TinySwords/UI Elements`
- `TinySwords/Units`

## Full asset path manifest

- `docs/tinyswords-assets.paths.txt`

The manifest contains one relative path per line and is intended to be the source of truth for loader mappings.

## Suggested usage in code

- Keep path lookups centralized in `src/game/assets.js`.
- Build category-specific loaders from manifest prefixes:
  - `TinySwords/Terrain/` for map tiles and decorations
  - `TinySwords/Units/` for animated characters and projectiles
  - `TinySwords/Buildings/` for static structures
  - `TinySwords/UI Elements/` for HUD/menus
  - `TinySwords/Particle FX/` for combat and environment effects

## Notes for later

- Paths currently use Windows separators (`\`). Convert to web-friendly `/` when creating Phaser load paths.
- If new assets are added, regenerate the manifest before updating loader keys.
