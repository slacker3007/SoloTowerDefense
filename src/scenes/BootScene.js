import Phaser from "phaser";
import { preloadTinySwords } from "../game/assets";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload() {
    preloadTinySwords(this);
  }

  create() {
    this.scene.start("game");
  }
}
