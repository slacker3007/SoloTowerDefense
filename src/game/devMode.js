/** @returns {boolean} True when dev tools / debug hotkeys should be available. */
export function isDevMode() {
  if (import.meta.env?.DEV) {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return new URLSearchParams(window.location.search).get("debug") === "1";
  } catch {
    return false;
  }
}

/** @param {...unknown} args */
export function devWarn(...args) {
  if (isDevMode()) {
    console.warn(...args);
  }
}
