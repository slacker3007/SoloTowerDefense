import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./constants";

const MOBILE_BREAKPOINT = 900;

export function isLikelyMobileDevice() {
  if (typeof window === "undefined") {
    return false;
  }
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const touchPoints = Number(navigator?.maxTouchPoints) || 0;
  const narrow = Math.min(window.innerWidth || 0, window.innerHeight || 0) <= MOBILE_BREAKPOINT;
  return coarse || touchPoints > 0 || narrow;
}

export function getPreferredOrientation() {
  return isLikelyMobileDevice() ? "portrait" : "landscape";
}

export function getViewportProfile(width, height) {
  const w = Math.max(1, Number(width) || window?.innerWidth || GAME_WIDTH);
  const h = Math.max(1, Number(height) || window?.innerHeight || GAME_HEIGHT);
  const isPortrait = h >= w;
  const preferred = getPreferredOrientation();
  return {
    width: w,
    height: h,
    isPortrait,
    isLandscape: !isPortrait,
    preferredOrientation: preferred,
    orientationMatchesPreference: preferred === (isPortrait ? "portrait" : "landscape"),
    deviceType: preferred === "portrait" ? "mobile" : "desktop",
  };
}

function getInitialGameSize() {
  const preferred = getPreferredOrientation();
  if (preferred === "landscape") {
    return { width: GAME_HEIGHT, height: GAME_WIDTH };
  }
  return { width: GAME_WIDTH, height: GAME_HEIGHT };
}

const initialSize = getInitialGameSize();

export const gameConfig = {
  type: Phaser.AUTO,
  backgroundColor: "#2a3b5a",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: initialSize.width,
    height: initialSize.height,
  },
  pixelArt: true,
};
