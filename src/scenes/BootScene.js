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
    // #region agent log
    console.log("[agent-log] BootScene create");
    fetch('http://127.0.0.1:7576/ingest/1dec1a9b-9444-4174-b16c-c421bd677924',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3311f3'},body:JSON.stringify({sessionId:'3311f3',runId:'run3',hypothesisId:'H8',location:'src/scenes/BootScene.js:create',message:'BootScene create executed',data:{scene:'boot'},timestamp:Date.now()})}).catch((err)=>{console.error('[agent-log] boot post failed', err);});
    // #endregion
    this.scene.start("game");
  }
}
