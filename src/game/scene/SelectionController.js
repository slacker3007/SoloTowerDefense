import Phaser from "phaser";
import { STARTING_LIVES, TILE_SIZE } from "../constants";
import { cellToWorld, isInsideGrid, worldToCell } from "../maps/tileRules";
import {
  getMaxSplashRadiusTilesFromEffects,
  getTowerDisplayName,
  getTowerEffectShortSummary,
  getTowerProjectileColor,
  getTowerTextureKey,
  toWorldRange,
} from "../balance";
import { cozyTheme } from "../ui/CozyTheme";
import { barracksTuning, combatTuning } from "../tuning";

/** Tower outlines, double-click group select, keyboard placement ghost (`GameScene` patterns). */
export class SelectionController {
  constructor(scene) {
    /** @type {Phaser.Scene & Record<string, unknown>} */
    this.scene = scene;
    this._towerDoubleClick = { signature: null, at: 0 };
    this._selectionPulse = null;
    this._lastSelectionPulseKey = null;
    /** @type {{ x: number; y: number } | null} */
    this._ghostCell = null;
    /** @type {((ev: KeyboardEvent) => void) | null} */
    this._ghostKeyHandler = null;
  }

  selectTowerGroup(towerType, anchorCellX, anchorCellY, anchorTower = null) {
    if (typeof towerType !== "string" || !towerType.length) {
      this.clearSelection();
      return false;
    }
    const tower = anchorTower ?? this.scene.towerSystem?.getTowerAtCell?.(anchorCellX, anchorCellY);
    if (!tower || tower.type !== towerType) {
      this.clearSelection();
      return false;
    }
    const entries = this.scene.towerSystem.getTowerEntriesByType(towerType);
    this.scene._selectedTowerType = towerType;
    this.scene._selectedTowerCells = entries.map((e) => ({ x: e.cellX, y: e.cellY }));
    this.scene.selectedBuilding = {
      kind: "tower",
      type: towerType,
      tier: tower.tier,
      label: getTowerDisplayName(towerType),
      iconKey: getTowerTextureKey(towerType),
      cellX: anchorCellX,
      cellY: anchorCellY,
      damage: tower.damage,
      cooldown: tower.cooldown,
      range: tower.range,
      effects: tower.effects ?? [],
      effectSummary: getTowerEffectShortSummary(tower.effects ?? []),
      selectedCount: Math.max(1, entries.length),
    };
    return true;
  }

  clearSelection() {
    this.scene._selectedTowerType = null;
    this.scene._selectedTowerCells = [];
  }

  refreshTowerGroupSelection() {
    const sb = this.scene.selectedBuilding;
    if (this.scene._selectedTowerType == null || sb?.kind !== "tower") return;
    const at = this.scene.towerSystem?.getTowerAtCell?.(sb.cellX, sb.cellY);
    if (!at || at.type !== this.scene._selectedTowerType) {
      this.clearSelection();
      sb.selectedCount = 1;
      return;
    }
    const entries = this.scene.towerSystem.getTowerEntriesByType(this.scene._selectedTowerType);
    this.scene._selectedTowerCells = entries.map((e) => ({ x: e.cellX, y: e.cellY }));
    Object.assign(sb, {
      type: at.type,
      tier: at.tier,
      label: getTowerDisplayName(at.type),
      iconKey: getTowerTextureKey(at.type),
      damage: at.damage,
      cooldown: at.cooldown,
      range: at.range,
      effects: at.effects ?? [],
      effectSummary: getTowerEffectShortSummary(at.effects ?? []),
      selectedCount: Math.max(1, entries.length),
    });
  }

  /** @returns {"group"|"single"|"none"} */
  handleTowerClick(cellX, cellY, clickedTower) {
    if (!clickedTower) {
      this._towerDoubleClick = { signature: null, at: 0 };
      this.clearSelection();
      return "none";
    }
    const ms = combatTuning.towerDoubleClickMs ?? 300;
    const now = this.scene.time.now;
    const sig = `${cellX},${cellY},${clickedTower.type}`;
    const dbl = this._towerDoubleClick.signature === sig && now - this._towerDoubleClick.at <= ms;
    this._towerDoubleClick = { signature: sig, at: now };
    if (dbl && this.selectTowerGroup(clickedTower.type, cellX, cellY, clickedTower)) return "group";
    this.clearSelection();
    return "single";
  }

  drawDashedRangeCircle(gfx, cx, cy, radius, color, alpha) {
    if (!gfx || !(radius > 0)) return;
    const arc = (Math.PI * 2) / 36;
    gfx.lineStyle(2, color, alpha);
    for (let i = 0; i < 36; i += 1) {
      const a0 = i * arc;
      gfx.beginPath();
      gfx.arc(cx, cy, radius, a0, a0 + arc * 0.6, false);
      gfx.strokePath();
    }
  }

  drawSolidRangeCircle(gfx, cx, cy, radius, color, edgeA, fillA) {
    if (!gfx || !(radius > 0)) return;
    gfx.fillStyle(color, Phaser.Math.Clamp(fillA, 0, 1));
    gfx.fillCircle(cx, cy, radius);
    gfx.lineStyle(2, color, Phaser.Math.Clamp(edgeA, 0, 1));
    gfx.strokeCircle(cx, cy, radius);
  }

  getSelectionPulseKey(selected) {
    if (!selected || typeof selected !== "object") return null;
    const s = /** @type {Record<string, unknown>} */ (selected);
    if (s.kind === "tower") {
      const gt = this.scene._selectedTowerType;
      const gc = Array.isArray(this.scene._selectedTowerCells) ? this.scene._selectedTowerCells : [];
      if (gt && gc.length) {
        const sig = gc
          .filter((c) => c && Number.isFinite(c.x) && Number.isFinite(c.y))
          .map((c) => `${c.x},${c.y}`)
          .sort()
          .join("|");
        return `tower-group:${gt}:${sig}`;
      }
      return `tower-single:${s.cellX},${s.cellY}:${s.type}`;
    }
    if (s.kind === "barracks") return `barracks:${s.cellX},${s.cellY}:${s.label ?? ""}`;
    return null;
  }

  redrawOutline() {
    const gfx = this.scene._selectionOutlineGfx;
    if (!gfx) return;
    gfx.clear();
    const sel = this.scene.selectedBuilding;
    const selected = sel && typeof sel === "object" ? /** @type {Record<string, unknown>} */ (sel) : null;
    if (!selected) {
      this._selectionPulse = null;
      this._lastSelectionPulseKey = null;
      return;
    }
    const now = this.scene.time.now;
    const pk = this.getSelectionPulseKey(selected);
    if (pk && pk !== this._lastSelectionPulseKey) {
      this._selectionPulse = { startedAt: now, durationMs: 320 };
      this._lastSelectionPulseKey = pk;
    }
    let rangePulse = 0;
    if (this._selectionPulse) {
      const prog = Math.min(
        1,
        (now - this._selectionPulse.startedAt) / Math.max(this._selectionPulse.durationMs, 1),
      );
      rangePulse = Math.sin(prog * Math.PI);
      if (prog >= 1) this._selectionPulse = null;
    }
    if (selected.kind === "tower") {
      const gc = Array.isArray(this.scene._selectedTowerCells) ? this.scene._selectedTowerCells : [];
      const cells =
        this.scene._selectedTowerType && gc.length ? gc : [{ x: Number(selected.cellX), y: Number(selected.cellY) }];
      const pulse = 0.7 + 0.3 * Math.sin(now / 220);
      const glow = cozyTheme.colors.panelBorder ?? 0xbda67a;
      const [rx, ry] = [TILE_SIZE * 0.55, TILE_SIZE * 0.22];
      const rr = 1 + 0.04 * rangePulse;
      const ea = 0.84 + 0.12 * rangePulse;
      const fa = 0.12 + 0.05 * rangePulse;
      for (const cell of cells) {
        if (!cell || !Number.isFinite(cell.x)) continue;
        const w = cellToWorld(cell.x, cell.y);
        const by = w.y + TILE_SIZE * 0.22;
        gfx.fillStyle(glow, 0.32);
        gfx.fillEllipse(w.x, by, rx * 2, ry * 2);
        gfx.lineStyle(3, glow, 0.45 * pulse + 0.35);
        gfx.strokeEllipse(w.x, by, rx * 2, ry * 2);
        const t = this.scene.towerSystem?.getTowerAtCell?.(cell.x, cell.y);
        if (!t) continue;
        const col = getTowerProjectileColor(t.type);
        this.drawSolidRangeCircle(gfx, t.x, t.y, t.range * rr, col, ea, fa);
        const sp = getMaxSplashRadiusTilesFromEffects(t.effects ?? []);
        if (sp > 0) this.drawDashedRangeCircle(gfx, t.x, t.y, toWorldRange(sp), col, 0.4);
      }
      return;
    }
    if (selected.kind === "barracks") {
      const w = cellToWorld(Number(selected.cellX), Number(selected.cellY));
      const bp = 0.7 + 0.3 * Math.sin(now / 220);
      const g = cozyTheme.colors.panelBorder ?? 0xbda67a;
      const sw = barracksTuning.clickWidth * 0.9;
      const sh = barracksTuning.clickHeight * 0.28;
      gfx.fillStyle(g, 0.28);
      gfx.fillEllipse(w.x, w.y + TILE_SIZE * 0.26, sw, sh);
      gfx.lineStyle(3, g, 0.45 * bp + 0.35);
      gfx.strokeEllipse(w.x, w.y + TILE_SIZE * 0.26, sw, sh);
    }
  }

  syncPlacementGhostFromWorld(worldX, worldY) {
    const map = this.scene.map;
    const mw = Number(map?.width);
    const mh = Number(map?.height);
    if (mw <= 0 || mh <= 0) return;
    const c = worldToCell(worldX, worldY);
    if (isInsideGrid(c.x, c.y, mw, mh)) this._ghostCell = { x: c.x, y: c.y };
  }

  bindPlacementKeyboardGhost() {
    this.unbindPlacementKeyboardGhost();
    /** @type {Record<string, readonly [number, number]>} */
    const nav = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    this._ghostKeyHandler = (ev) => {
      const pend = this.scene._pendingPlacement;
      if (!pend || /** @type {{ type?: string }} */ (pend).type !== "tower") return;
      if (this.scene.gameState?.paused || this.scene.editor?.enabled || this.scene.hud?.isMenuDropdownOpen?.()) return;
      if (ev.repeat) return;
      const mw = Number(this.scene.map?.width);
      const mh = Number(this.scene.map?.height);
      if (!(mw > 0 && mh > 0)) return;
      const enter = ev.key === "Enter" || ev.key === "NumpadEnter";
      if (!enter && ev.key !== "Escape" && nav[ev.key] == null) return;
      ev.preventDefault();
      let g = this._ghostCell;
      if (!g || !isInsideGrid(g.x, g.y, mw, mh)) g = this._guessInitialGhostCell(mw, mh);
      if (!g) return;
      if (enter) {
        const tt = /** @type {{ towerType?: string }} */ (pend).towerType ?? "basic";
        this._confirmGhostPlacement(g, tt);
      } else if (ev.key === "Escape") {
        this._cancelGhostPlacement();
      } else {
        const m = /** @type {readonly [number, number]} */ (nav[ev.key]);
        g = {
          x: Phaser.Math.Clamp(g.x + m[0], 0, mw - 1),
          y: Phaser.Math.Clamp(g.y + m[1], 0, mh - 1),
        };
        this._ghostCell = g;
        const wpt = cellToWorld(g.x, g.y);
        this.scene.updateTowerGhost?.({ worldX: wpt.x, worldY: wpt.y });
      }
    };
    this.scene.input.keyboard.on("keydown", this._ghostKeyHandler);
  }

  unbindPlacementKeyboardGhost() {
    if (this._ghostKeyHandler) this.scene.input.keyboard?.off?.("keydown", this._ghostKeyHandler);
    this._ghostKeyHandler = null;
    this._ghostCell = null;
  }

  _confirmGhostPlacement(cell, towerType) {
    if (typeof this.scene.builderSystem?.startTowerBuild !== "function") return;
    const gs = this.scene.gameState;
    if (!this.scene.builderSystem.startTowerBuild(cell.x, cell.y, towerType, gs)) return;
    const rm = this.scene._placementReturnMode;
    this.scene.clearTowerPlacement?.();
    this.scene.setHudActionMode?.(rm ?? "empty");
    this.scene.debugOverlay?.redraw?.();
    this.scene.hud?.render?.(
      gs,
      this.scene.towerSystem?.towers?.length ?? 0,
      STARTING_LIVES,
      this.scene.selectedBuilding,
      this.scene.getWaveInfo?.() ?? {},
    );
    this.unbindPlacementKeyboardGhost();
  }

  _cancelGhostPlacement() {
    this.scene.clearTowerPlacement?.();
    const sb = /** @type {Record<string, unknown> | null} */ (this.scene.selectedBuilding ?? null);
    const isBlue = sb?.kind === "barracks" && sb.label === "Blue Barracks";
    if (isBlue) {
      this.scene.setHudActionMode?.("barracksMain");
      this.scene.updateHudActions?.();
      this.scene.hud?.render?.(
        this.scene.gameState,
        this.scene.towerSystem?.towers?.length ?? 0,
        STARTING_LIVES,
        this.scene.selectedBuilding,
        this.scene.getWaveInfo?.() ?? {},
      );
    } else {
      this.scene.reselectBlueBarracks?.();
    }
    this.unbindPlacementKeyboardGhost();
  }

  _guessInitialGhostCell(mapW, mapH) {
    const hb = this.scene.map?.points?.homeBarracks;
    const ox = Number(hb?.x);
    const oy = Number(hb?.y);
    let cx = Number.isFinite(ox)
      ? Phaser.Math.Clamp(Math.round(ox + 4), 0, mapW - 1)
      : Math.floor(mapW / 2);
    let cy = Number.isFinite(oy)
      ? Phaser.Math.Clamp(Math.round(oy + Math.floor(mapH * 0.26)), 0, mapH - 1)
      : Math.floor(mapH / 2);
    const ts = this.scene.towerSystem;
    const gs = this.scene.gameState;
    const ok = (x, y) => isInsideGrid(x, y, mapW, mapH) && !!ts?.canPlaceTowerAtCell?.(x, y, gs);
    if (!ts?.canPlaceTowerAtCell) return { x: cx, y: cy };
    if (ok(cx, cy)) return { x: cx, y: cy };
    const R = Math.max(mapW, mapH);
    for (let r = 1; r <= R; r += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && ok(cx + dx, cy + dy)) {
            return { x: cx + dx, y: cy + dy };
          }
        }
      }
    }
    return {
      x: Number.isFinite(ox) ? Phaser.Math.Clamp(Math.round(ox), 0, mapW - 1) : cx,
      y: Number.isFinite(oy) ? Phaser.Math.Clamp(Math.round(oy), 0, mapH - 1) : cy,
    };
  }

  dispose() {
    this.unbindPlacementKeyboardGhost();
  }
}
