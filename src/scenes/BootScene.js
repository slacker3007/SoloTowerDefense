import Phaser from "phaser";
import { preloadTinySwords } from "../game/assets";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload() {
    const { width, height } = this.scale;
    const cx = width * 0.5;
    const cy = height * 0.5;
    this.cameras.main.setBackgroundColor("#1a2233");
    const title = this.add.text(cx, cy - 64, "Tiny Tower Defense", {
      fontFamily: "Georgia, serif",
      fontSize: "32px",
      color: "#f8efe0",
    }).setOrigin(0.5, 0.5);
    const frame = this.add.rectangle(cx, cy, Math.min(420, width * 0.72), 18, 0x120d12, 0.9)
      .setStrokeStyle(2, 0xbda67a, 0.85);
    const fill = this.add.rectangle(frame.x - frame.width * 0.5 + 2, cy, 4, 12, 0x7aa2d1, 1)
      .setOrigin(0, 0.5);
    const label = this.add.text(cx, cy + 36, "Loading assets...", {
      fontFamily: "monospace",
      fontSize: "15px",
      color: "#d9c8ac",
    }).setOrigin(0.5, 0.5);
    this.load.on("progress", (value) => {
      fill.width = Math.max(4, (frame.width - 4) * value);
    });
    this.load.on("complete", () => {
      title.setText("Ready");
      label.setText("Starting...");
    });
    // Audio is currently generated procedurally by AudioManager, so no audio files are queued here.
    preloadTinySwords(this);
  }

  create() {
    this.scene.start("main-menu");
  }
}
