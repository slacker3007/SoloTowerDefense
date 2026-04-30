# Balancing Framework

This project now uses a centralized balancing model in `src/game/balance.js`.

## Core Rules

- Archer is the DPS baseline (efficiency `1.0`).
- Utility-focused towers should target `70%` to `85%` DPS-equivalent output.
- Crowd-control uptime per enemy is capped to `~60%` in a `12s` window.
- Wave difficulty uses both stat growth and role composition.

## Tower Data

- `towerCatalog` defines base level-1 stats for all 8 tower archetypes.
- `towerCatalog.basic` is the only barracks-built starter tower.
- `upgrades` defines `t1`, `t2a/t2b`, `t3a/t3b` effects and stat multipliers.
- `getUpgradeOptionsForTower()` resolves legal graph edges at runtime:
  - `basic -> convert:element`
  - `element tower -> T1 -> T2A/T2B -> T3A/T3B`
- Tower placement and upgrading are resolved through `TowerSystem`.

## Economy

- Starting values are set in balance and exported through constants:
  - starting gold: `200`
  - starting lives: `20`
- Tower cost model:
  - base: `100`
  - t1: `x1.5`
  - t2: `x2.2`
  - t3: `x3.5`
- Breather waves grant `+50%` per-kill gold.

## Enemy and Wave Scaling

- Base functions:
  - `HP = 50 * (1.16^(wave-1))`
  - `Count = 6 + wave * 1.8`
  - `Speed = 1.0 + wave * 0.02` (scaled to world speed in `WaveSystem`)
- Role modifiers:
  - Normal, Fast, Tank, Swarm, Elite
- `waveProgram` drives role sequencing for waves 1-15 and beyond.
- Wave entries can provide tuning metadata (`expectedTowerCount`, `expectedDpsBand`) for debug/sim targets.

## Dynamic Adjustment

`GameScene` computes soft per-wave adaptation:

- Dominating wave: increase next-wave hp/count slightly.
- Struggling wave: reduce next-wave speed/count slightly.

This behavior is intentionally bounded and optional (`balanceRules.adaptive.enabled`, with runtime toggle on `O` key).

## Effect Guardrails

- Utility-DPS guardrail keeps non-archer towers near the 70-85% baseline budget.
- Per-enemy CC remains capped in a 12s rolling window.
- Anti-loop limits clamp chain and volley fan-out to finite caps.

## Simulation and Sanity

Use:

`npm run balance:sim`

This runs `scripts/balance-sim.js` and prints waves 1-15 with:

- role
- count
- hp/total hp
- estimated team DPS
- estimated TTK
- wave gold

It also fails if sanity checks detect invalid wave outputs (non-positive stats or unstable TTK band).
