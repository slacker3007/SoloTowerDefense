const OVERLAY_KEY = "__unitHpOverlayRoot";
const INSTANCES_KEY = "__unitHpBarInstances";
const BAR_STYLES = {
  small: {
    width: 38,
    height: 6,
    yOffset: 0,
  },
  default: {
    width: 56,
    height: 8,
    yOffset: 0,
  },
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function resolveOverlayHost(scene) {
  const canvas = scene?.game?.canvas;
  if (!canvas || !canvas.parentElement) {
    return null;
  }
  return canvas.parentElement;
}

function worldToScreen(scene, worldX, worldY) {
  const cam = scene?.cameras?.main;
  if (!cam) {
    return { x: worldX, y: worldY };
  }
  const canvas = scene?.game?.canvas;
  const scaleW = scene?.scale?.width || cam.width || 1;
  const scaleH = scene?.scale?.height || cam.height || 1;
  const cssScaleX = canvas?.clientWidth ? canvas.clientWidth / scaleW : 1;
  const cssScaleY = canvas?.clientHeight ? canvas.clientHeight / scaleH : 1;
  
  return {
    x: (cam.x + (worldX - cam.scrollX - cam.width * 0.5) * cam.zoom + cam.width * 0.5) * cssScaleX,
    y: (cam.y + (worldY - cam.scrollY - cam.height * 0.5) * cam.zoom + cam.height * 0.5) * cssScaleY,
  };
}

export function ensureUnitHpOverlay(scene) {
  const host = resolveOverlayHost(scene);
  if (!host) {
    return null;
  }
  if (host.dataset.unitHpOverlayHost !== "1") {
    host.dataset.unitHpOverlayHost = "1";
    if (!host.style.position) {
      host.style.position = "relative";
    }
  }
  const existing = scene[OVERLAY_KEY];
  if (existing && existing.parentElement === host) {
    return existing;
  }
  const overlay = document.createElement("div");
  overlay.className = "unit-hp-overlay";
  host.appendChild(overlay);
  scene[OVERLAY_KEY] = overlay;
  return overlay;
}

function ensureInstanceSet(scene) {
  if (!scene[INSTANCES_KEY]) {
    scene[INSTANCES_KEY] = new Set();
  }
  return scene[INSTANCES_KEY];
}

export function syncUnitHpBars(scene) {
  const items = scene[INSTANCES_KEY];
  if (!items) {
    return;
  }
  for (const item of items) {
    item.syncPosition();
  }
}

export function destroyUnitHpOverlay(scene) {
  const overlay = scene[OVERLAY_KEY];
  if (overlay) {
    overlay.remove();
    scene[OVERLAY_KEY] = null;
  }
  scene[INSTANCES_KEY]?.clear();
}

/**
 * @param {Phaser.Scene} scene
 * @param {{ style?: "small" | "default", worldX: number, worldY: number }} opts
 * @returns {{ container: null, setRatio: (r: number) => void, setWorldPosition: (x:number, y:number) => void, destroy: () => void } | null}
 */
export function createUnitHpBar(scene, opts) {
  const style = BAR_STYLES[opts.style ?? "small"];
  if (!style) {
    return null;
  }
  const overlay = ensureUnitHpOverlay(scene);
  if (!overlay) {
    return null;
  }
  const instances = ensureInstanceSet(scene);

  const root = document.createElement("div");
  const styleKey = opts.style ?? "small";
  root.className = `unit-hp-bar unit-hp-bar--${styleKey}`;
  root.style.width = `${style.width}px`;
  root.style.height = `${style.height}px`;

  const fill = document.createElement("div");
  fill.className = "unit-hp-bar__fill";
  root.appendChild(fill);
  overlay.appendChild(root);

  let ratio = 1;
  let worldX = opts.worldX;
  let worldY = opts.worldY + style.yOffset;
  let alive = true;

  const applyRatio = () => {
    if (!alive) {
      return;
    }
    const next = clamp01(ratio);
    fill.style.transform = `scaleX(${next})`;
    root.style.opacity = next <= 0 ? "0" : "1";
  };

  const applyPosition = () => {
    if (!alive) {
      return;
    }
    const p = worldToScreen(scene, worldX, worldY);
    root.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -50%)`;
  };

  applyRatio();
  applyPosition();
  const instance = { syncPosition: applyPosition };
  instances.add(instance);

  return {
    container: null,
    setRatio(r) {
      ratio = r;
      applyRatio();
    },
    setWorldPosition(xPos, yPos) {
      worldX = xPos;
      worldY = yPos + style.yOffset;
      applyPosition();
    },
    destroy() {
      alive = false;
      instances.delete(instance);
      root.remove();
    },
  };
}
