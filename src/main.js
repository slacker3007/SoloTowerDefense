import Phaser from "phaser";
import { gameConfig } from "./game/config";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { MainMenuScene } from "./scenes/MainMenuScene";
import { SettingsScene } from "./scenes/SettingsScene";

const config = {
  ...gameConfig,
  parent: "app",
  scene: [BootScene, MainMenuScene, SettingsScene, GameScene],
};

new Phaser.Game(config);
