import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./constants";

export const gameConfig = {
  type: Phaser.AUTO,
  backgroundColor: "#2a3b5a",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
};
