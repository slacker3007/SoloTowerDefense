const OVERLAY_KEY = "__unitHpOverlayRoot";
const INSTANCES_KEY = "__unitHpBarInstances";

const BAR_STYLES = {
  small: {
    width: 38,
    height: 6,
    yOffset: 0,
    border: 1,
  },
  default: {
    width: 56,
    height: 8,
    yOffset: 0,
    border: 1,
  },
};

/**
 * @param {Phaser.Scene} scene
 */
export function ensureUnitHpOverlay(scene) {
  if (scene[OVERLAY_KEY]) {
    return scene[OVERLAY_KEY];
  }
  const root = scene.add.container(0, 0);
  root.setDepth(50); // Above units, below HUD
  scene[OVERLAY_KEY] = root;
  
  if (scene.worldRoot) {
    scene.worldRoot.add(root);
  }

  if (scene.uiCamera) {
    scene.uiCamera.ignore(root);
  }
  
  return root;
}

function ensureInstanceSet(scene) {
  if (!scene[INSTANCES_KEY]) {
    scene[INSTANCES_KEY] = new Set();
  }
  return scene[INSTANCES_KEY];
}

export function syncUnitHpBars(scene) {
}

export function destroyUnitHpOverlay(scene) {
  const root = scene[OVERLAY_KEY];
  if (root) {
    root.destroy(true);
    scene[OVERLAY_KEY] = null;
  }
  scene[INSTANCES_KEY]?.clear();
}

/**
 * @param {Phaser.Scene} scene
 * @param {{ style?: "small" | "default", worldX: number, worldY: number }} opts
 * @returns {{ container: Phaser.GameObjects.Container, setRatio: (r: number) => void, setWorldPosition: (x:number, y:number) => void, destroy: () => void } | null}
 */
export function createUnitHpBar(scene, opts) {
  const style = BAR_STYLES[opts.style ?? "small"];
  if (!style) {
    return null;
  }
  const root = ensureUnitHpOverlay(scene);
  if (!root) {
    return null;
  }
  const instances = ensureInstanceSet(scene);

  const container = scene.add.container(opts.worldX, opts.worldY);
  root.add(container);

  // Background/Border
  const bg = scene.add.rectangle(0, 0, style.width, style.height, 0x000000, 1); // Solid black background
  bg.setStrokeStyle(2, 0xf6e8c9, 1); // Thicker beige border
  
  // Fill
  const fill = scene.add.rectangle(-style.width / 2 + style.border + 1, 0, style.width - style.border * 2 - 2, style.height - style.border * 2 - 2, 0xdf3737, 1);
  fill.setOrigin(0, 0.5);

  container.add([bg, fill]);

  let ratio = 1;

  const applyRatio = () => {
    const r = Math.max(0, Math.min(1, ratio));
    fill.setScale(r, 1);
    container.setVisible(r > 0);
  };

  applyRatio();

  const api = {
    container,
    setRatio(r) {
      ratio = r;
      applyRatio();
    },
    setWorldPosition(x, y) {
      container.setPosition(x, y + style.yOffset);
    },
    destroy() {
      instances.delete(api);
      container.destroy(true);
    },
  };

  instances.add(api);
  return api;
}
