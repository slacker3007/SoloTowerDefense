import Phaser from "phaser";
import { gameConfig } from "./game/config";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";

// #region agent log
console.log("[agent-log] main.js loaded");
document.title = "AGENT-DEBUG-3311f3";
window.__agentDebugLoaded = true;
console.log("[agent-log] typeof fetch", typeof fetch);
fetch('http://127.0.0.1:7576/ingest/1dec1a9b-9444-4174-b16c-c421bd677924',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3311f3'},body:JSON.stringify({sessionId:'3311f3',runId:'run4',hypothesisId:'H9',location:'src/main.js:startup',message:'Main entry executed',data:{entry:'main.js'},timestamp:Date.now()})})
  .then((res)=>{console.log("[agent-log] main post status", res.status, res.ok);})
  .catch((err)=>{console.error('[agent-log] main post failed', err);});
// #endregion

const config = {
  ...gameConfig,
  parent: "app",
  scene: [BootScene, GameScene],
};

new Phaser.Game(config);
