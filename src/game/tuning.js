/** Centralized gameplay tuning constants (camera, builder, overlays, combat radii). */

export const cameraTuning = {
  defaultZoom: 0.59,
  defaultScrollX: -12,
  defaultScrollY: 335,
  introScrollY: 514,
  introPanMs: 3000,
  verticalOnly: true,
  zoomMin: 0.5,
  zoomMax: 2,
  pinchSensitivity: 0.004,
};

export const builderTuning = {
  buildSeconds: 2.4,
  moveSpeed: 140,
};

export const combatTuning = {
  projectileHitRadius: 8,
  towerDoubleClickMs: 300,
};

export const overlayTuning = {
  pauseDepth: 180,
  runEndDepth: 185,
  tutorialDepth: 175,
};

export const barracksTuning = {
  clickWidth: 192,
  clickHeight: 256,
  fireHpThreshold: 10,
};
