import { cellToWorld } from "../maps/tileRules";
import { findGridPath } from "./pathfinding";
import { isEnemyWalkableCellIgnoringOccupancyKey } from "../maps/walkability";

const BUILD_SECONDS = 5;
/** World units per second — fast cross-map travel */
const RUN_SPEED = 520;
const PAWN_SCALE = 0.5;
const DEPTH_PAWN = 19;

/** @typedef {"runTo" | "build" | "runHome"} BuilderPhase */

/**
 * @param {*} map
 * @param {*} scene
 * @param {string | null} ignoreOccupancyKey
 */
function makeBuilderWalkable(map, scene, ignoreOccupancyKey) {
  const spawn = map.points?.enemyBarracks ?? { x: 0, y: 0 };
  const target = map.points?.homeBarracks ?? { x: 0, y: 0 };
  return (cellX, cellY) =>
    isEnemyWalkableCellIgnoringOccupancyKey(map, scene, cellX, cellY, spawn, target, ignoreOccupancyKey);
}

export class BuilderSystem {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ map?: *, towerSystem?: *, onAfterJobComplete?: () => void }} [options]
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    this.map = options.map ?? scene.map ?? null;
    this.towerSystem = options.towerSystem ?? null;
    this.onAfterJobComplete = typeof options.onAfterJobComplete === "function" ? options.onAfterJobComplete : null;
    /** @type {any[]} */
    this.jobs = [];
  }

  /**
   * @param {number} cellX
   * @param {number} cellY
   * @param {string} towerType
   * @param {{ gold: number }} gameState
   * @returns {boolean}
   */
  startTowerBuild(cellX, cellY, towerType, gameState) {
    if (!this.map || !this.towerSystem) {
      return false;
    }
    const hb = this.map.points?.homeBarracks;
    if (!hb || typeof hb.x !== "number" || typeof hb.y !== "number") {
      return false;
    }

    if (!this.towerSystem.tryReserveTowerConstruction(cellX, cellY, gameState)) {
      return false;
    }

    const goalKey = `${cellX},${cellY}`;
    const startWorld = cellToWorld(hb.x, hb.y);
    const goalCell = { x: cellX, y: cellY };

    const runSheet = this.scene.textures.exists("bluePawnRunHammerSheet") ? "bluePawnRunHammerSheet" : null;
    const interactSheet = this.scene.textures.exists("bluePawnInteractHammerSheet") ? "bluePawnInteractHammerSheet" : null;
    const runAnim = this.scene.anims.exists("blue-pawn-run-hammer") ? "blue-pawn-run-hammer" : null;
    const interactAnim = this.scene.anims.exists("blue-pawn-interact-hammer") ? "blue-pawn-interact-hammer" : null;

    let sprite = null;
    if (runSheet) {
      sprite = this.scene.add.sprite(startWorld.x, startWorld.y, runSheet, 0);
      sprite.setScale(PAWN_SCALE);
      sprite.setDepth(DEPTH_PAWN);
      if (runAnim) {
        sprite.play(runAnim);
      }
    } else {
      sprite = this.scene.add.circle(startWorld.x, startWorld.y, 14, 0x4a8cff);
      sprite.setDepth(DEPTH_PAWN);
    }

    const unitsParent = this.scene.unitsWorldLayer ?? this.scene.worldRoot;
    if (unitsParent) {
      unitsParent.add(sprite);
    }

    const isWalkableTo = makeBuilderWalkable(this.map, this.scene, goalKey);
    const pathTo =
      findGridPath({ x: hb.x, y: hb.y }, goalCell, isWalkableTo, this.map) ??
      /** @type {{ x: number, y: number }[] | null} */ (null);

    let pathCellsTo = pathTo && pathTo.length >= 2 ? pathTo : null;
    let waypointIndexTo = 0;
    if (pathCellsTo) {
      waypointIndexTo = pathCellsTo[0].x === hb.x && pathCellsTo[0].y === hb.y ? 1 : 0;
      if (waypointIndexTo >= pathCellsTo.length) {
        waypointIndexTo = pathCellsTo.length - 1;
      }
    }

    const job = {
      cellX,
      cellY,
      towerType,
      sprite,
      runSheet,
      interactSheet,
      runAnim,
      interactAnim,
      /** @type {BuilderPhase} */
      phase: "runTo",
      buildRemaining: BUILD_SECONDS,
      pathCellsTo,
      waypointIndexTo,
      pathCellsFrom: /** @type {{ x: number, y: number }[] | null} */ (null),
      waypointIndexFrom: 0,
      goalKey,
      goalWorld: cellToWorld(cellX, cellY),
    };

    this.jobs.push(job);
    return true;
  }

  /**
   * @param {number} deltaSeconds
   */
  update(deltaSeconds) {
    const next = [];
    for (const job of this.jobs) {
      const alive = this._tickJob(job, deltaSeconds);
      if (alive) {
        next.push(job);
      }
    }
    this.jobs = next;
  }

  destroy() {
    const gs = this.scene?.gameState;
    for (const job of this.jobs) {
      if (gs && this.towerSystem && !this.towerSystem.getTowerAtCell(job.cellX, job.cellY)) {
        this.towerSystem.cancelReservedTowerConstruction(job.cellX, job.cellY, gs);
      }
      job.sprite?.destroy?.();
    }
    this.jobs = [];
  }

  /**
   * @param {any} job
   * @param {number} deltaSeconds
   * @returns {boolean} true if job still active
   */
  _tickJob(job, deltaSeconds) {
    if (job.phase === "runTo") {
      const done = this._moveTowardGoal(job, deltaSeconds, "to");
      if (done) {
        job.phase = "build";
        this._setBuildVisual(job);
      }
      return true;
    }

    if (job.phase === "build") {
      job.buildRemaining -= deltaSeconds;
      if (job.buildRemaining <= 0) {
        const ok = this.towerSystem?.completeReservedTower?.(job.cellX, job.cellY, job.towerType);
        if (!ok) {
          const gs = this.scene?.gameState;
          if (gs) {
            this.towerSystem?.cancelReservedTowerConstruction?.(job.cellX, job.cellY, gs);
          }
          job.sprite?.destroy?.();
          this.onAfterJobComplete?.();
          return false;
        }
        job.phase = "runHome";
        this._setRunVisual(job);
        this._initReturnPath(job);
        this.onAfterJobComplete?.();
      }
      return true;
    }

    if (job.phase === "runHome") {
      const done = this._moveTowardGoal(job, deltaSeconds, "from");
      if (done) {
        job.sprite?.destroy?.();
        this.onAfterJobComplete?.();
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * @param {any} job
   */
  _setBuildVisual(job) {
    const s = job.sprite;
    if (!s || !job.interactSheet) {
      return;
    }
    if (typeof s.setTexture === "function") {
      s.setTexture(job.interactSheet, 0);
    }
    if (job.interactAnim && typeof s.play === "function") {
      s.play(job.interactAnim);
    }
  }

  /**
   * @param {any} job
   */
  _setRunVisual(job) {
    const s = job.sprite;
    if (!s || !job.runSheet) {
      return;
    }
    if (typeof s.setTexture === "function") {
      s.setTexture(job.runSheet, 0);
    }
    if (job.runAnim && typeof s.play === "function") {
      s.play(job.runAnim);
    }
  }

  /**
   * @param {any} job
   */
  _initReturnPath(job) {
    const hb = this.map.points?.homeBarracks;
    if (!hb) {
      job.pathCellsFrom = null;
      return;
    }
    const fromCell = { x: job.cellX, y: job.cellY };
    const isWalkableFrom = makeBuilderWalkable(this.map, this.scene, job.goalKey);
    const path =
      findGridPath(fromCell, { x: hb.x, y: hb.y }, isWalkableFrom, this.map) ??
      /** @type {{ x: number, y: number }[] | null} */ (null);
    if (path && path.length >= 2) {
      job.pathCellsFrom = path;
      let wi = path[0].x === fromCell.x && path[0].y === fromCell.y ? 1 : 0;
      if (wi >= path.length) {
        wi = path.length - 1;
      }
      job.waypointIndexFrom = wi;
    } else {
      job.pathCellsFrom = null;
    }
  }

  /**
   * @param {any} job
   * @param {number} deltaSeconds
   * @param {"to" | "from"} mode
   * @returns {boolean} true when segment complete (at goal)
   */
  _moveTowardGoal(job, deltaSeconds, mode) {
    const s = job.sprite;
    if (!s) {
      return true;
    }

    let targetWorld;
    if (mode === "to") {
      if (job.pathCellsTo && job.pathCellsTo[job.waypointIndexTo] != null) {
        const c = job.pathCellsTo[job.waypointIndexTo];
        targetWorld = cellToWorld(c.x, c.y);
      } else {
        targetWorld = job.goalWorld;
      }
    } else if (job.pathCellsFrom && job.pathCellsFrom[job.waypointIndexFrom] != null) {
      const c = job.pathCellsFrom[job.waypointIndexFrom];
      targetWorld = cellToWorld(c.x, c.y);
    } else {
      const hb = this.map.points?.homeBarracks;
      targetWorld = hb ? cellToWorld(hb.x, hb.y) : { x: s.x, y: s.y };
    }

    const dx = targetWorld.x - s.x;
    const dy = targetWorld.y - s.y;
    const dist = Math.hypot(dx, dy);
    const step = RUN_SPEED * deltaSeconds;

    if (dist < step || dist < 2) {
      s.x = targetWorld.x;
      s.y = targetWorld.y;
      if (mode === "to") {
        if (job.pathCellsTo) {
          if (job.waypointIndexTo < job.pathCellsTo.length - 1) {
            job.waypointIndexTo += 1;
            return false;
          }
        }
        return true;
      }
      if (job.pathCellsFrom) {
        if (job.waypointIndexFrom < job.pathCellsFrom.length - 1) {
          job.waypointIndexFrom += 1;
          return false;
        }
      }
      return true;
    }

    const nx = dx / dist;
    const ny = dy / dist;
    s.x += nx * step;
    s.y += ny * step;
    if (typeof s.setFlipX === "function") {
      s.setFlipX(nx < 0);
    }
    return false;
  }
}
