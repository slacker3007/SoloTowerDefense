# Survival simulation results

Deterministic lane survival runs using [`scripts/survival-sim.js`](../scripts/survival-sim.js). Game over when **lives reach 0** (starting lives from [`economy.startingLives`](../src/game/balance.js) = 20).

## Methodology

| Setting | Value |
|--------|--------|
| Lane length | 72 × 64 px (matches default map BFS route length) |
| Tick | 0.05 s (20 Hz) |
| Wave spawner | Same rules as [`WaveSystem`](../src/game/systems/WaveSystem.js) (`interval`, `maxAlive`, spawn count, HP/speed from balance) |
| Coverage | **Saturated**: every tower can attack every alive enemy (effective range clamped to lane length; tower radii are shorter than the path in tile space) |
| Economy | **Ignored** — towers are pre-placed with conversions/upgrades already applied (isolates tower effectiveness) |
| RNG | Mulberry32; **10 seeds** per scenario (`BASE_SEED = 0xfeed2025`, stride `9973`) |

### Scenarios

| ID | Composition |
|----|----------------|
| **S1** | 50× basic, no upgrades |
| **S2–S9** | 30× one element + **T1 only** (archer, fire, ice, lightning, nature, earth, dark, holy) |
| **S10** | Hybrid: **25× dark + T1** + **25× lightning + T1** (50 towers total). Chosen after S2–S9: best single-element was **dark** (curse stacking increases damage taken); **lightning** was second-best raw survival with **chain** spill damage. Combining curse amplification with chain throughput maximizes kill rate under saturated targeting. |

### Metrics

- **Waves cleared (`median`, `min–max`)**: Count of full wave completions (spawner advances to the next wave) before game over. Higher is better.
- **First leak (median)**: Wave index when the **first** enemy reached the goal (leaked). Later is better.

---

## Results (10 seeds each)

All seeds produced identical outcomes for these scenarios (no branching RNG on the paths exercised — e.g. archer T1 has no crit).

| Rank | ID | Label | Median waves cleared | Range | Mean | Median first leak |
|------|-----|--------|----------------------|-------|------|-------------------|
| 1 | **S10** | Hybrid 25× dark+T1 + 25× lightning+T1 | **24** | 24–24 | 24.0 | 24 |
| 2 | **S8** | 30× dark + T1 | **21** | 21–21 | 21.0 | 20 |
| 3 | **S5** | 30× lightning + T1 | **19** | 19–19 | 19.0 | 19 |
| 4 | **S1** | 50× basic | **18** | 18–18 | 18.0 | 17 |
| 5 | **S2** | 30× archer + T1 | **18** | 18–18 | 18.0 | 18 |
| 6 | **S9** | 30× holy + T1 | **16** | 16–16 | 16.0 | 15 |
| 7 | **S3** | 30× fire + T1 | **16** | 16–16 | 16.0 | 15 |
| 8 | **S4** | 30× ice + T1 | **15** | 15–15 | 15.0 | 15 |
| 8 | **S6** | 30× nature + T1 | **15** | 15–15 | 15.0 | 15 |
| 8 | **S7** | 30× earth + T1 | **15** | 15–15 | 15.0 | 15 |

---

## What worked best

1. **Dark (T1 curse)** — Each hit applies a curse status that increases **incoming damage** (`damageEnemy` adds curse ratios). Under heavy focus-fire with 30 towers, many overlapping curse instances **add** extra damage-taken ratios on successive hits, shredding HP scaling earlier than linear DPS-only towers.

2. **Lightning (T1 chain)** — Chains extra damage to nearby enemies along the lane (within effective range), reducing wasted overkill on the front runner during dense spawn intervals.

3. **Hybrid (dark + lightning)** — Keeps curse amplification while adding chain spillover; **24 waves cleared** vs **21** for dark-only at the same tier depth (30 vs 50 towers — hybrid also has more tower bodies, which strictly increases saturated DPS).

## What performed worst (tied)

**Ice, nature, and earth (30× + T1)** — **15 waves cleared**.

| Tower | T1 effect | Why it struggled here |
|-------|-----------|------------------------|
| **Ice** | Slow | Slow helps travel time but saturated basic DPS from only 30 towers was insufficient vs scaling HP/count; CC cap limits uptime. |
| **Nature** | Poison DoT | DoT uses the same guardrails as the live game; poison adds sustained damage but front-loaded burst + curse/chain scaled better in this model. |
| **Earth** | Splash | Splash radius (~1.2 tiles world space) only clips **nearby** enemies on the 1D lane; many waves spread enemies enough that splash rarely doubled throughput vs single-target focus fire. |

---

## How to reproduce

```bash
npm run survival:sim
```

---

## Caveats

- **Not a pixel-perfect Phaser replay** — simplified 1D progression with saturated range; real maps, placement, and projectile travel would change absolute numbers.
- **Hybrid tower count** — S10 uses **50** towers vs **30** for elemental scenarios; higher tower counts raise sustained DPS in this model. Compare **S8 (30× dark)** to **S10** when interpreting “how much” hybrid improves.
