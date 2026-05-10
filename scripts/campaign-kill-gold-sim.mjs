/**
 * Estimates total enemy kill gold for a full clear of scripted waves 1–49
 * (all pack spawns, splitter children, boss HP-threshold adds). Matches
 * WaveSystem reward math + EnemySystem.getKillGold (including economy.killGoldScale).
 * Assumes no hoarder early-kill +5, no path goldBonusOnKill, no tower bonusGoldPerKill.
 */
import {
  economy,
  getGoldPerKill,
  getWaveGoldIncomeMultiplier,
  scriptedWaveProgram,
} from "../src/game/balance.js";
import { enemyArchetypes } from "../src/game/enemyCatalog.js";

const MAX_WAVE = 49;
const TOLERANCE_LOW = 54_900;
const TOLERANCE_HIGH = 55_100;

function rewardGoldForPack(waveIndex, packType, packRewardMult = 1) {
  const arch = enemyArchetypes[packType] ?? enemyArchetypes.grunt;
  const rewardBase = getGoldPerKill(waveIndex, false);
  const rm = Number.isFinite(arch.rewardMultiplier) ? arch.rewardMultiplier : 1;
  const pm = Number.isFinite(packRewardMult) ? packRewardMult : 1;
  return Math.max(1, Math.round(rewardBase * rm * pm));
}

function killGoldForSim(rewardGold, waveIndex) {
  const base = rewardGold;
  const waveGold = getWaveGoldIncomeMultiplier(waveIndex);
  const scale = Number.isFinite(economy.killGoldScale) ? economy.killGoldScale : 1;
  return Math.max(0, Math.round(base * waveGold * scale));
}

function archExtras(type) {
  const arch = enemyArchetypes[type] ?? enemyArchetypes.grunt;
  return {
    goldBonusOnKill: arch.bonusGoldOnKill ?? 0,
    earlyKillHpThreshold: arch.earlyKillHpThreshold ?? null,
    earlyKillBonusGold: arch.earlyKillBonusGold ?? 0,
  };
}

function simulateWaves(maxWave) {
  let total = 0;
  for (let w = 1; w <= maxWave; w++) {
    const sw = scriptedWaveProgram[w - 1];
    if (!sw) break;
    const queue = [];
    for (const pack of sw.packs ?? []) {
      const c = Math.max(0, Number(pack.count) || 0);
      for (let i = 0; i < c; i++) queue.push({ type: pack.type, wave: w });
    }
    for (let qi = 0; qi < queue.length; qi++) {
      const { type, wave } = queue[qi];
      const rg = rewardGoldForPack(wave, type);
      const ex = archExtras(type);
      let bonus = 0;
      if (ex.earlyKillHpThreshold != null && ex.earlyKillBonusGold > 0) {
        // Sim assumes no hoarder early bonus (same as balance tuning baseline).
      } else if (ex.goldBonusOnKill > 0) {
        // Sim assumes no path early-kill bonus.
      }
      total += killGoldForSim(rg + bonus, wave);
      const arch = enemyArchetypes[type];
      if (arch?.splitOnDeath) {
        const child = arch.splitOnDeath.childType;
        const n = Math.max(1, Number(arch.splitOnDeath.count) || 1);
        for (let k = 0; k < n; k++) queue.push({ type: child, wave });
      }
      if (Array.isArray(arch?.spawnOnThresholds)) {
        for (const e of arch.spawnOnThresholds) {
          const cnt = Number(e.count) || 0;
          for (let k = 0; k < cnt; k++) queue.push({ type: e.type, wave });
        }
      }
    }
  }
  return total;
}

const total = simulateWaves(MAX_WAVE);
console.log(`campaign kill gold (waves 1–${MAX_WAVE}, baseline assumptions): ${total}`);
console.log(`economy.killGoldScale: ${economy.killGoldScale}`);

if (total < TOLERANCE_LOW || total > TOLERANCE_HIGH) {
  console.error(
    `Expected total in [${TOLERANCE_LOW}, ${TOLERANCE_HIGH}] — adjust economy.killGoldScale in src/game/balance.js`,
  );
  process.exit(1);
}
