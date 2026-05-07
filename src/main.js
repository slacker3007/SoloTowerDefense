import Phaser from "phaser";
import { gameConfig, getViewportProfile } from "./game/config";
import { GAME_HEIGHT, GAME_WIDTH } from "./game/constants";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { MainMenuScene } from "./scenes/MainMenuScene";
import { SettingsScene } from "./scenes/SettingsScene";

const config = {
  ...gameConfig,
  parent: "app",
  scene: [BootScene, MainMenuScene, SettingsScene, GameScene],
};

const game = new Phaser.Game(config);

const syncResponsiveScale = () => {
  const profile = getViewportProfile(window.innerWidth, window.innerHeight);
  const targetWidth = profile.isPortrait ? GAME_WIDTH : GAME_HEIGHT;
  const targetHeight = profile.isPortrait ? GAME_HEIGHT : GAME_WIDTH;
  game.scale.setGameSize(targetWidth, targetHeight);
  game.scale.refresh();
};

window.addEventListener("resize", syncResponsiveScale);
window.addEventListener("orientationchange", syncResponsiveScale);
syncResponsiveScale();
