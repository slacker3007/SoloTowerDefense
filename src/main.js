import Phaser from "phaser";
import { gameConfig } from "./game/config";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";

const config = {
  ...gameConfig,
  parent: "app",
  scene: [BootScene, GameScene],
};

new Phaser.Game(config);
