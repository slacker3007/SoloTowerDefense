import Phaser from "phaser";
import { createTinySwordsAnimations } from "../game/assets";
import { GAME_HEIGHT, GAME_WIDTH, TILE_SIZE } from "../game/constants";
import {
  buildMenuIslandMap,
  cellCenterLocal,
  renderMenuTerrainBackdrop,
} from "../game/maps/menuTerrainBackdrop";
import { cozyTheme, createCozyButton, createCozyPanel } from "../game/ui/CozyTheme";

/** Scale for menu water texture tiling and island tilemap (terrain, foam, buildings, units). */
/** Was 3×; 25% smaller → 3 × 0.75 */
const MENU_BACKGROUND_ASSET_SCALE = 2.25;

const MENU_ISLAND_COLS = 15;
const MENU_ISLAND_ROWS = 18;
const DEPTH_WATER = -20;
const DEPTH_BACKDROP = 8;
const DEPTH_LETTERBOX = 25;
const DEPTH_VIGNETTE = 12;
const DEPTH_LOGO = 48;
const DEPTH_UI = 40;

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super("main-menu");
    /** @type {string | undefined} */
    this._menuBackdropSeed = undefined;
    /** @type {Phaser.GameObjects.TileSprite | null} */
    this._menuWater = null;
    /** @type {((size: Phaser.Structs.Size) => void) | null} */
    this._boundResize = null;
  }

  create() {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    if (this._menuBackdropSeed == null) {
      this._menuBackdropSeed = `${Date.now()}-${Phaser.Math.RND.integer()}`;
    }
    this._boundResize = (size) => this._handleResize(size);
    this.scale.on(Phaser.Scale.Events.RESIZE, this._boundResize);
    this.rebuildLayout();
  }

  shutdown() {
    if (this._boundResize) {
      this.scale.off(Phaser.Scale.Events.RESIZE, this._boundResize);
      this._boundResize = null;
    }
    this._menuWater = null;
  }

  /**
   * @param {number} _t
   * @param {number} delta
   */
  update(_t, delta) {
    if (this._menuWater && this._menuWater.active) {
      const s = MENU_BACKGROUND_ASSET_SCALE;
      this._menuWater.tilePositionX += delta * 0.011 * s;
      this._menuWater.tilePositionY += delta * 0.007 * s;
    }
  }

  rebuildLayout() {
    this.children.removeAll(true);
    this._menuWater = null;
    const { width, height } = this.scale;
    const contentWidth = Math.min(width - 24, 760);
    const centerX = width * 0.5;
    const barH = Math.max(12, Math.round(height * 0.045));
    const midTop = barH;
    const midHeight = Math.max(1, height - barH * 2);
    const midCy = midTop + midHeight * 0.5;

    createTinySwordsAnimations(this);

    this.cameras.main.setBackgroundColor(cozyTheme.colors.bgDark);

    if (this.textures.exists("waterBackground")) {
      const water = this.add.tileSprite(centerX, midCy, width + 16, midHeight + 8, "waterBackground");
      water.setOrigin(0.5, 0.5);
      const src = this.textures.get("waterBackground").getSourceImage();
      if (src && src.width > 0 && src.height > 0) {
        water.tilePositionX = src.width * 0.25;
        water.tilePositionY = src.height * 0.15;
      }
      water.setTileScale(MENU_BACKGROUND_ASSET_SCALE, MENU_BACKGROUND_ASSET_SCALE);
      water.setDepth(DEPTH_WATER);
      this._menuWater = water;
    } else {
      this.add
        .rectangle(centerX, midCy, width + 16, midHeight + 8, 0x2d4f7d, 1)
        .setOrigin(0.5, 0.5)
        .setDepth(DEPTH_WATER);
    }

    this.add
      .rectangle(0, 0, width, barH, cozyTheme.colors.bgDark, 1)
      .setOrigin(0, 0)
      .setDepth(DEPTH_LETTERBOX);
    this.add
      .rectangle(0, height - barH, width, barH, cozyTheme.colors.bgDark, 1)
      .setOrigin(0, 0)
      .setDepth(DEPTH_LETTERBOX);

    const rng = new Phaser.Math.RandomDataGenerator([String(this._menuBackdropSeed)]);
    const { map, warriorCell, archerCell } = buildMenuIslandMap(MENU_ISLAND_COLS, MENU_ISLAND_ROWS, rng);

    const mapPixelW = map.width * TILE_SIZE;
    const mapPixelH = map.height * TILE_SIZE;
    const islandScale =
      Math.min(width / mapPixelW, (midHeight * 0.52) / mapPixelH) *
      0.88 *
      Math.min(1, width / 720) *
      MENU_BACKGROUND_ASSET_SCALE;
    const backdropY = midTop + midHeight * 0.44 - 300;
    const backdropX = centerX - width * 0.08;
    const backdrop = this.add.container(backdropX, backdropY);
    backdrop.setDepth(DEPTH_BACKDROP);
    renderMenuTerrainBackdrop(this, backdrop, map);
    backdrop.setScale(islandScale);

    const halfMapH = (mapPixelH * islandScale) / 2;
    if (backdrop.y + halfMapH > height - barH - 6) {
      backdrop.setY(height - barH - 6 - halfMapH);
    }

    const wpos = cellCenterLocal(warriorCell);
    if (wpos != null && this.textures.exists("blueWarriorIdleSheet")) {
      const warrior = this.add.sprite(wpos.x, wpos.y, "blueWarriorIdleSheet");
      warrior.setScale(0.36);
      if (this.anims.exists("blue-warrior-idle")) {
        warrior.play("blue-warrior-idle");
      }
      backdrop.add(warrior);
    }

    const apos = cellCenterLocal(archerCell);
    if (apos != null && this.textures.exists("blueArcherIdleSheet")) {
      const archer = this.add.sprite(apos.x, apos.y, "blueArcherIdleSheet");
      archer.setScale(0.3);
      if (this.anims.exists("blue-archer-idle")) {
        archer.play("blue-archer-idle");
      }
      backdrop.add(archer);
    }

    const gfx = this.add.graphics();
    gfx.fillGradientStyle(0x120d12, 0x120d12, 0x120d12, 0x120d12, 0.5, 0.5, 0, 0, 1);
    gfx.fillRect(0, 0, width, height * 0.38);
    gfx.setDepth(DEPTH_VIGNETTE);

    const panel = createCozyPanel(this, centerX, height * 0.48 + 50, Math.min(620, contentWidth - 36), Math.min(500, height * 0.54));
    panel.setDepth(DEPTH_UI);
    panel.setFillStyle(cozyTheme.colors.panelElevated, 0.82);

    const panelTop = panel.y - panel.height * 0.5;
    if (this.textures.exists("gameLogo")) {
      const logo = this.add.image(centerX, 0, "gameLogo");
      logo.setDepth(DEPTH_LOGO);
      const maxLogoW = Math.min(520, contentWidth - 48);
      if (logo.width > 0) {
        logo.setScale(Math.min(1, maxLogoW / logo.width));
      }
      logo.setY(panelTop + 28 + 150 - logo.displayHeight * 0.5);
    }

    const buttonWidth = Math.min(320, contentWidth - 96);
    const firstY = panel.y - 28;
    const gap = 58;
    const startGame = () => {
      if (this.scene.isActive("game")) {
        this.scene.stop("game");
      }
      this.scene.start("game");
    };
    const startBtn = createCozyButton(this, "Start Run", startGame, { width: buttonWidth, fontSize: 26 });
    const settingsBtn = createCozyButton(this, "Settings", () => {
      this.registry.set("settingsReturnScene", "main-menu");
      this.scene.start("settings");
    }, { width: buttonWidth, fontSize: 24 });
    const quitBtn = createCozyButton(this, "Quit", () => {
      window.close();
    }, { width: buttonWidth, fontSize: 24 });

    startBtn.setPosition(panel.x, firstY);
    settingsBtn.setPosition(panel.x, firstY + gap);
    quitBtn.setPosition(panel.x, firstY + gap * 2);
    startBtn.setDepth(DEPTH_UI + 1);
    settingsBtn.setDepth(DEPTH_UI + 1);
    quitBtn.setDepth(DEPTH_UI + 1);

    const hint = this.add.text(panel.x, panel.y + panel.height * 0.36, "Tip: Home Barracks is selected when you start. Press 1 to build your first tower.", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "15px",
      color: cozyTheme.colors.textMuted,
      align: "center",
      wordWrap: { width: Math.min(520, GAME_WIDTH * 0.5) },
    });
    hint.setOrigin(0.5, 0.5);
    hint.setAlpha(0.92);
    hint.setDepth(DEPTH_UI + 1);
  }

  /**
   * @param {Phaser.Structs.Size} size
   */
  _handleResize(size) {
    if (!this.sys.isActive()) {
      return;
    }
    const w = size.width || GAME_WIDTH;
    const h = size.height || GAME_HEIGHT;
    this.cameras.main.setViewport(0, 0, w, h);
    this.rebuildLayout();
  }
}
