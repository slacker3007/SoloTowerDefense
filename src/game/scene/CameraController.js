import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../constants.js";
import { getViewportProfile } from "../config.js";
import { cameraTuning } from "../tuning.js";

/** Camera intro tween, HUD margins clamp, middle-mouse pan, pinch + one-finger touch pan (GameScene-derived). */
export class CameraController {
  constructor(scene) {
    /** @type {Phaser.Scene & Record<string, unknown>} */
    this.scene = scene;
    this._middlePanActive = false;
    this._lastPanX = 0;
    this._lastPanY = 0;
    /** @type {Phaser.Tweens.Tween | null} */
    this._introCameraTween = null;
    this._introCameraPanActive = false;
    this._touchPanActive = false;
    this._touchLastSX = 0;
    this._touchLastSY = 0;
    this._touchAccumDx = 0;
    this._touchAccumDy = 0;
    this._pinchPrevDist = 0;
    this._boundResize = null;
    this._onPointerMove = null;
    this._onPointerDown = null;
    this._onPointerUp = null;
    this._preventTwoFingerChromeScroll = null;
  }

  _middleHeld(pointer) {
    const ev = /** @type {MouseEvent | undefined} */ (pointer.event);
    const buttons = typeof ev?.buttons === "number" ? ev.buttons : 0;
    return pointer.middleButtonDown() || (buttons & 4) === 4;
  }

  _middleStillHeldSomewhere() {
    const mgr = this.scene.input?.manager?.pointers;
    return Array.isArray(mgr) && mgr.some((p) => p.active && p.isDown && this._middleHeld(p));
  }

  _touchPointer(pointer) {
    const evt = pointer.event ? /** @type {PointerEvent} */ (pointer.event) : null;
    return evt?.pointerType === "touch";
  }

  _touchPointersDown() {
    const mgr = this.scene.input?.manager?.pointers;
    if (!Array.isArray(mgr)) return [];
    return mgr.filter((p) => p.active && p.isDown && this._touchPointer(p));
  }

  syncHudCameraTelemetry() {
    const cam = this.scene.cameras?.main;
    if (!cam || typeof this.scene.hud?.setCameraTelemetry !== "function") return;
    this.scene.hud.setCameraTelemetry({ zoom: cam.zoom, x: cam.scrollX, y: cam.scrollY });
  }

  handleResize(size = {}) {
    const width = Math.max(1, Number(size.width) || this.scene.scale.width || GAME_WIDTH);
    const height = Math.max(1, Number(size.height) || this.scene.scale.height || GAME_HEIGHT);
    const profile = getViewportProfile(width, height);
    const cam = this.scene.cameras.main;
    cam.setViewport(0, 0, width, height);
    this.scene.uiCamera?.setViewport?.(0, 0, width, height);
    const dz = cameraTuning.defaultZoom;
    if (profile.isPortrait && cam.zoom > 0.82) cam.setZoom(0.82);
    if (profile.isLandscape && cam.zoom < dz) cam.setZoom(dz);
    this.scene.hud?.setViewportMode?.(profile.isPortrait ? "portrait" : "landscape");
    this.scene.hud?.layout?.(width, height);
    if (!this._introCameraPanActive) this.clampScroll();
    else this.syncHudCameraTelemetry();
  }

  clampScroll() {
    const cam = this.scene.cameras.main;
    const m = this.scene.hud?.getOcclusionMargins?.() ?? { top: 0, bottom: 0, left: 0, right: 0 };
    const mapW = typeof this.scene._mapPixelW === "number" ? this.scene._mapPixelW : GAME_WIDTH;
    const mapH = typeof this.scene._mapPixelH === "number" ? this.scene._mapPixelH : GAME_HEIGHT;
    const visW = Math.max(1, (cam.width - m.left - m.right) / cam.zoom);
    const visH = Math.max(1, (cam.height - m.top - m.bottom) / cam.zoom);
    const leftV = m.left / cam.zoom;
    const topV = m.top / cam.zoom;
    const minSX = Math.min(0, mapW - visW) - leftV;
    const maxSX = Math.max(0, mapW - visW) - leftV;
    const minSY = Math.min(0, mapH - visH) - topV;
    const maxSY = Math.max(0, mapH - visH) - topV;
    let sx = cam.scrollX;
    sx = cameraTuning.verticalOnly ? cameraTuning.defaultScrollX : Phaser.Math.Clamp(cam.scrollX, minSX, maxSX);
    cam.setScroll(sx, Phaser.Math.Clamp(cam.scrollY, minSY, maxSY));
    this.syncHudCameraTelemetry();
  }

  applyInitialPose() {
    const cam = this.scene.cameras.main;
    cam.setZoom(cameraTuning.defaultZoom);
    cam.setScroll(cameraTuning.defaultScrollX, cameraTuning.defaultScrollY);
    this.syncHudCameraTelemetry();
  }

  startIntroPan() {
    if (this.scene.editor?.enabled) {
      this.applyInitialPose();
      return;
    }
    const cam = this.scene.cameras.main;
    cam.setZoom(cameraTuning.defaultZoom);
    cam.setScroll(cameraTuning.defaultScrollX, cameraTuning.introScrollY);
    this.syncHudCameraTelemetry();
    this._introCameraPanActive = true;
    this._introCameraTween?.remove?.();
    this._introCameraTween = this.scene.tweens.add({
      targets: cam,
      scrollY: cameraTuning.defaultScrollY,
      duration: cameraTuning.introPanMs,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this._introCameraTween = null;
        this._introCameraPanActive = false;
        this.syncHudCameraTelemetry();
        this.clampScroll();
      },
    });
  }

  cancelIntroPan() {
    if (!this._introCameraPanActive && !this._introCameraTween) return;
    this._introCameraTween?.remove?.();
    this._introCameraTween = null;
    this._introCameraPanActive = false;
    this.syncHudCameraTelemetry();
    this.clampScroll();
  }

  applyPinchZoom() {
    const pts = this._touchPointersDown();
    if (pts.length < 2) {
      this._pinchPrevDist = 0;
      return;
    }
    const d = Phaser.Math.Distance.Between(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
    if (d <= 36) return;
    this.cancelIntroPan();
    const cam = this.scene.cameras.main;
    if (this._pinchPrevDist > 36) {
      const raw = Phaser.Math.Clamp(d / this._pinchPrevDist, 0.95, 1.05);
      const sens = Number.isFinite(cameraTuning.pinchSensitivity) ? cameraTuning.pinchSensitivity : 0.004;
      const ratio = Phaser.Math.Linear(1, raw, Math.min(1, sens * 180));
      cam.setZoom(cam.zoom * ratio);
    }
    cam.setZoom(Phaser.Math.Clamp(cam.zoom, cameraTuning.zoomMin, cameraTuning.zoomMax));
    this._pinchPrevDist = d;
    this.syncHudCameraTelemetry();
    this.clampScroll();
  }

  applyTouchPan() {
    const dx = this._touchAccumDx;
    const dy = this._touchAccumDy;
    this._touchAccumDx = this._touchAccumDy = 0;
    const cam = this.scene.cameras.main;
    const nx = cameraTuning.verticalOnly ? cameraTuning.defaultScrollX : cam.scrollX - dx / cam.zoom;
    cam.setScroll(nx, cam.scrollY - dy / cam.zoom);
    this.syncHudCameraTelemetry();
    this.clampScroll();
  }

  _feedTouchFinger(pointer) {
    const dx = pointer.x - this._touchLastSX;
    const dy = pointer.y - this._touchLastSY;
    this._touchLastSX = pointer.x;
    this._touchLastSY = pointer.y;
    if (cameraTuning.verticalOnly) this._touchAccumDy += dy;
    else {
      this._touchAccumDx += dx;
      this._touchAccumDy += dy;
    }
  }

  bindInput() {
    this.unbindInput();
    this._preventTwoFingerChromeScroll = (e) => {
      const t = /** @type {TouchEvent | undefined} */ (e);
      if ((t?.touches?.length ?? 0) === 2) t?.preventDefault?.();
    };
    this.scene.canvas?.addEventListener?.("touchmove", this._preventTwoFingerChromeScroll, { passive: false });
    this.scene.input?.addPointer?.(2);

    this._onPointerMove = (pointer) => {
      if (this._middlePanActive && !this._middleHeld(pointer)) this._middlePanActive = false;
      if (this._middlePanActive) {
        const cam = this.scene.cameras.main;
        const dx = pointer.x - this._lastPanX;
        const dy = pointer.y - this._lastPanY;
        this._lastPanX = pointer.x;
        this._lastPanY = pointer.y;
        if (!cameraTuning.verticalOnly) cam.scrollX -= dx / cam.zoom;
        else cam.scrollX = cameraTuning.defaultScrollX;
        cam.scrollY -= dy / cam.zoom;
        this.cancelIntroPan();
        this.syncHudCameraTelemetry();
        this.clampScroll();
        return;
      }
      if (this.scene.editor?.enabled) return;
      if (this.scene.gameState?.paused) return;
      const touchPts = this._touchPointersDown();
      if (touchPts.length >= 2) {
        if (this.scene.hud?.isPointBlockedByHud?.(touchPts[0].x, touchPts[0].y)) return;
        this.cancelIntroPan();
        this.applyPinchZoom();
        return;
      }
      const hudBlock = Boolean(this.scene.hud?.isPointBlockedByHud?.(pointer.x, pointer.y));
      if (this._touchPanActive && touchPts.length === 1 && this._touchPointer(pointer) && !hudBlock) {
        this.cancelIntroPan();
        this._feedTouchFinger(pointer);
        this.applyTouchPan();
      }
    };

    this._onPointerDown = (pointer) => {
      if (this._middleHeld(pointer)) {
        pointer.event instanceof Event && pointer.event.preventDefault?.();
        this.cancelIntroPan();
        this._middlePanActive = true;
        this._lastPanX = pointer.x;
        this._lastPanY = pointer.y;
        return;
      }
      if (
        this.scene.hud?.isPointBlockedByHud?.(pointer.x, pointer.y) ||
        this.scene.editor?.enabled ||
        this.scene.gameState?.paused
      ) {
        return;
      }
      if (!this._touchPointer(pointer)) return;
      const pts = this._touchPointersDown();
      if (pts.length === 1) {
        this.cancelIntroPan();
        this._touchPanActive = true;
        this._touchLastSX = pointer.x;
        this._touchLastSY = pointer.y;
      }
      if (pts.length >= 2) {
        this._touchPanActive = false;
        this._pinchPrevDist = 0;
      }
    };

    this._onPointerUp = () => {
      this._middlePanActive = this._middleStillHeldSomewhere();
      const pts = this._touchPointersDown();
      if (pts.length < 2) this._pinchPrevDist = 0;
      if (pts.length === 0) {
        this._touchPanActive = false;
        this._touchAccumDx = this._touchAccumDy = 0;
      } else if (pts.length === 1) {
        this._touchPanActive = true;
        this._touchLastSX = pts[0].x;
        this._touchLastSY = pts[0].y;
      }
    };

    this.scene.input?.on?.("pointermove", this._onPointerMove);
    this.scene.input?.on?.("pointerdown", this._onPointerDown);
    this.scene.input?.on?.("pointerup", this._onPointerUp);
    this.scene.input?.on?.("pointercancel", this._onPointerUp);

    this._boundResize = (gameSize) => {
      if (gameSize && typeof gameSize === "object") {
        const w = Number(gameSize.width);
        const h = Number(gameSize.height);
        if (Number.isFinite(w) && Number.isFinite(h)) {
          this.handleResize({ width: w, height: h });
          return;
        }
      }
      this.handleResize({ width: this.scene.scale.width, height: this.scene.scale.height });
    };
    this.scene.scale.on(Phaser.Scale.Events.RESIZE, this._boundResize);
    this.handleResize({ width: this.scene.scale.width, height: this.scene.scale.height });
  }

  unbindInput() {
    if (this.scene.canvas?.removeEventListener && this._preventTwoFingerChromeScroll) {
      this.scene.canvas.removeEventListener("touchmove", this._preventTwoFingerChromeScroll);
    }
    this._preventTwoFingerChromeScroll = null;
    if (this._onPointerMove) this.scene.input?.off?.("pointermove", this._onPointerMove);
    if (this._onPointerDown) this.scene.input?.off?.("pointerdown", this._onPointerDown);
    if (this._onPointerUp) {
      this.scene.input?.off?.("pointerup", this._onPointerUp);
      this.scene.input?.off?.("pointercancel", this._onPointerUp);
    }
    this._onPointerMove = this._onPointerDown = this._onPointerUp = null;
    if (this._boundResize) this.scene.scale.off(Phaser.Scale.Events.RESIZE, this._boundResize);
    this._boundResize = null;
    this._middlePanActive = this._touchPanActive = false;
    this._touchAccumDx = this._touchAccumDy = this._pinchPrevDist = 0;
  }

  dispose() {
    this.cancelIntroPan();
    this.unbindInput();
  }
}
