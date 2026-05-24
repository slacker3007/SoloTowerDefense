const STORAGE_KEY = "soloTd.highscore.v1";

/** @typedef {{ score: number, waves: number, goldEarned: number, towersBuilt: number, killStreak: number, runSeconds: number, at: number }} HighScoreEntry */

/** @returns {Record<string, HighScoreEntry>} */
export function getHighScores() {
  if (typeof localStorage === "undefined") {
    return {};
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

/**
 * @param {string} mode
 * @param {HighScoreEntry} entry
 */
export function saveHighScore(mode, entry) {
  const key = typeof mode === "string" && mode.length > 0 ? mode : "campaign";
  const all = getHighScores();
  const prev = all[key];
  const score = Math.max(0, Number(entry.score) || 0);
  if (!prev || score > (Number(prev.score) || 0)) {
    all[key] = {
      score,
      waves: Math.max(0, Number(entry.waves) || 0),
      goldEarned: Math.max(0, Number(entry.goldEarned) || 0),
      towersBuilt: Math.max(0, Number(entry.towersBuilt) || 0),
      killStreak: Math.max(0, Number(entry.killStreak) || 0),
      runSeconds: Math.max(0, Number(entry.runSeconds) || 0),
      at: Date.now(),
    };
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      } catch {
        /* ignore */
      }
    }
    return all[key];
  }
  return prev;
}

/**
 * @param {string} [mode]
 * @returns {HighScoreEntry | null}
 */
export function getBestHighScore(mode = "campaign") {
  const all = getHighScores();
  return all[mode] ?? null;
}

/**
 * @param {{ waves: number, goldEarned: number, towersBuilt: number, killStreak: number, runSeconds: number, victory: boolean }} stats
 * @returns {number}
 */
export function computeRunScore(stats) {
  const wavePts = Math.max(0, Number(stats.waves) || 0) * 120;
  const goldPts = Math.max(0, Number(stats.goldEarned) || 0) * 0.35;
  const towerPts = Math.max(0, Number(stats.towersBuilt) || 0) * 8;
  const streakPts = Math.max(0, Number(stats.killStreak) || 0) * 15;
  const timePts = Math.max(0, Number(stats.runSeconds) || 0) * 0.5;
  const victoryBonus = stats.victory ? 800 : 0;
  return Math.round(wavePts + goldPts + towerPts + streakPts + timePts + victoryBonus);
}
