export class Hud {
  constructor(scene) {
    this.scene = scene;
    this.text = scene.add.text(16, 16, "", {
      fontFamily: "monospace",
      fontSize: "20px",
      color: "#ffffff",
      backgroundColor: "#00000066",
      padding: { x: 10, y: 6 },
    });
    this.text.setDepth(100);
    this.text.setScrollFactor(0);
  }

  render(state) {
    this.text.setText(
      `Gold: ${state.gold}   Lives: ${state.lives}   Wave: ${state.wave}\n` +
        `[Click] Place tower (30)  [P] Pause  [R] Restart  [G] Grid  [E] Map editor (6 = select cell)`
    );
  }
}
