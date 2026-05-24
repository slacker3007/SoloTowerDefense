import { getAudioSettings, setAudioSettings } from "../settings/audioSettings.js";
import { GAME_EVENT, gameEvents } from "../events.js";

/** Web Audio procedural SFX + oscillator drones — singleton (`attachToScene` once). */
/** @typedef {"menu" | "gameplay"} MusicName */

class AudioManager {
  constructor() {
    /** @type {import("phaser").Scene | null} */ this._scene = null;
    /** @type {AudioContext | null} */ this._ctx = null;
    /** @type {GainNode | null} */ this._master = null;
    /** @type {GainNode | null} */ this._musicGain = null;
    /** @type {GainNode | null} */ this._sfxGain = null;
    /** @type {{ o: OscillatorNode; g: GainNode }[]} */ this._musicNodes = [];
    /** @type {number} */ this._musicRaf = 0;
    /** @type {MusicName | null} */ this._musicName = null;
    /** @type {number} */ this._duck = 1;
    /** @type {(() => void) | null} */ this._resumeHandler = null;
    /** @type {boolean} */ this._eventsBound = false;
    this._bindGameEvents();
  }

  /** @param {import("phaser").Scene} scene */
  attachToScene(scene) {
    this._scene = scene;
    const ctx =
      scene.sound?.context ?? (typeof AudioContext !== "undefined" ? new AudioContext() : null);
    if (ctx !== this._ctx) {
      this._ctx = ctx;
      this._master = ctx?.createGain() ?? null;
      this._musicGain = ctx?.createGain() ?? null;
      this._sfxGain = ctx?.createGain() ?? null;
      if (this._master && this._musicGain && this._sfxGain && ctx) {
        this._musicGain.connect(this._master);
        this._sfxGain.connect(this._master);
        this._master.connect(ctx.destination);
      }
    }
    this._hydrateLevels();
    const el = scene.sys?.game?.canvas;
    if (el && !this._resumeHandler) {
      this._resumeHandler = () => ctx?.resume?.();
      el.addEventListener("pointerdown", this._resumeHandler, { passive: true });
    }
    void ctx?.resume?.();
    if (this._musicName) this.playMusic(this._musicName);
  }

  _hydrateLevels() {
    const s = getAudioSettings();
    if (!this._master || !this._musicGain || !this._sfxGain) return;
    this._master.gain.value = s.muted ? 0 : s.master;
    this._musicGain.gain.value = s.music * this._duck;
    this._sfxGain.gain.value = s.sfx;
  }

  /** Prefade SFX (mute + master); `sfx` fader sits on `_sfxGain`. */
  _sfxScale() {
    const s = getAudioSettings();
    return s.muted ? 0 : Math.max(0, Math.min(1, s.master));
  }

  /** @param {OscillatorType} [type] */
  _envTone(freq, ampRel, atk, dur, type = "sine") {
    const ctx = this._ctx,
      dst = this._sfxGain;
    if (!ctx || !dst || dur <= 0) return;
    const peak = ampRel * this._sfxScale();
    if (peak <= 0) return;
    const t0 = ctx.currentTime,
      o = ctx.createOscillator(),
      gn = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    gn.gain.setValueAtTime(0, t0);
    gn.gain.linearRampToValueAtTime(Math.max(1e-4, peak), t0 + atk);
    gn.gain.exponentialRampToValueAtTime(1e-4, t0 + dur);
    o.connect(gn).connect(dst);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
    setTimeout(() => {
      try {
        o.disconnect();
        gn.disconnect();
      } catch {
        /* noop */
      }
    }, (dur + 0.1) * 1000);
  }

  _noiseBurst(ampRel, dur, filtLo = 400) {
    const ctx = this._ctx;
    if (!ctx || !this._sfxGain || dur <= 0) return;
    const peak = ampRel * this._sfxScale();
    if (peak <= 0) return;
    const buf = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * dur), ctx.sampleRate),
      data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter(),
      gn = ctx.createGain();
    f.type = "lowpass";
    f.frequency.value = filtLo;
    const t0 = ctx.currentTime;
    gn.gain.setValueAtTime(0, t0);
    gn.gain.linearRampToValueAtTime(Math.max(1e-4, peak), t0 + 0.003);
    gn.gain.exponentialRampToValueAtTime(1e-4, t0 + dur);
    src.connect(f).connect(gn).connect(this._sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
    setTimeout(() => {
      try {
        src.disconnect();
        gn.disconnect();
      } catch {
        /* noop */
      }
    }, (dur + 0.12) * 1000);
  }

  /** @param {string} name */
  playSfx(name) {
    void this._ctx?.resume?.();
    if (!this._ctx || !this._sfxGain || this._sfxScale() <= 0 || getAudioSettings().sfx <= 0) return;
    const b = () => this._noiseBurst(0.12, 0.035, 1200);
    switch (name) {
      case "ui-click":
        b();
        break;
      case "ui-hover":
        this._envTone(880, 0.048, 0.002, 0.05);
        break;
      case "build-start":
        this._envTone(180, 0.09, 0.01, 0.18, "triangle");
        break;
      case "build-complete":
        this._envTone(392, 0.1, 0.005, 0.12);
        this._envTone(523, 0.08, 0.02, 0.16);
        break;
      case "upgrade":
        this._envTone(523, 0.08, 0.01, 0.1);
        this._envTone(659, 0.068, 0.05, 0.12);
        break;
      case "sell":
        this._envTone(330, 0.09, 0.005, 0.15, "sawtooth");
        break;
      case "convert":
        this._envTone(220, 0.08, 0.02, 0.2, "square");
        this._envTone(440, 0.058, 0.08, 0.18, "triangle");
        break;
      case "tower-fire":
        b();
        this._envTone(1200, 0.055, 0.001, 0.045);
        break;
      case "enemy-hit":
        b();
        this._envTone(90, 0.12, 0.002, 0.06, "triangle");
        break;
      case "enemy-death":
        this._noiseBurst(0.29, 0.14, 800);
        this._envTone(55, 0.11, 0.01, 0.28, "sawtooth");
        break;
      case "leak":
        this._envTone(140, 0.14, 0.03, 0.45, "sawtooth");
        break;
      case "wave-start":
        this._envTone(293, 0.09, 0.01, 0.25);
        this._envTone(440, 0.074, 0.05, 0.32);
        break;
      case "boss-spawn":
        this._envTone(55, 0.16, 0.05, 0.85, "sine");
        this._noiseBurst(0.09, 0.2, 200);
        break;
      case "victory":
        [523, 659, 783, 1046].forEach((hz, i) => this._envTone(hz, 0.12 - i * 0.012, i * 0.08 + 0.01, 0.35));
        break;
      case "defeat":
        [293, 233, 196].forEach((hz, i) =>
          this._envTone(hz, 0.11 - i * 0.02, i * 0.07 + 0.02, 0.42, "triangle"),
        );
        break;
      case "pause":
        this._envTone(349, 0.065, 0.008, 0.12);
        break;
      default:
        break;
    }
  }

  _disconnectMusicOsc() {
    if (this._musicRaf) {
      cancelAnimationFrame(this._musicRaf);
      this._musicRaf = 0;
    }
    for (const { o, g } of this._musicNodes) {
      try {
        o.stop();
        o.disconnect();
        g.disconnect();
      } catch {
        /* noop */
      }
    }
    this._musicNodes = [];
  }

  /** @param {MusicName} name */
  playMusic(name) {
    void this._ctx?.resume?.();
    this._musicName = name;
    const ctx = this._ctx;
    if (!ctx || !this._musicGain) return;
    this._disconnectMusicOsc();
    if (getAudioSettings().muted) return;
    const menu = name === "menu";
    const freqs = menu ? [98, (98 * 5) / 4] : [65.4, (65.4 * 3) / 2],
      stamp = typeof performance !== "undefined" ? performance.now() : Date.now(),
      t0 = ctx.currentTime,
      mgr = this;
    for (let i = 0; i < freqs.length; i++) {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.type = "sine";
      o.detune.value = menu ? 5 + i * 10 : -4 - i * 7;
      o.frequency.setValueAtTime(freqs[i], t0);
      g.gain.setValueAtTime(0.03 * (i ? 0.55 : 1), t0);
      o.connect(g).connect(this._musicGain);
      o.start(t0);
      this._musicNodes.push({ o, g });
    }
    const perfNow = typeof performance !== "undefined" ? () => performance.now() : () => Date.now(),
      oscs = this._musicNodes.map((x) => x.o);
    const loop = () => {
      if (!mgr._musicNodes.length) return;
      const ph = ((perfNow() - stamp) / 1000) * 0.42,
        wb = Math.sin(ph * 3.7) * 35 + Math.sin(ph * 0.92) * 52 + Math.sin((ph / 60) * 4) * 28;
      oscs.forEach((o, i) => {
        const base = menu ? 5 + i * 10 : -4 - i * 7;
        o.detune?.setTargetAtTime(base + wb, ctx.currentTime, 0.08);
      });
      mgr._musicRaf = requestAnimationFrame(loop);
    };
    mgr._musicRaf = requestAnimationFrame(loop);
  }

  stopMusic() {
    this._musicName = null;
    this._disconnectMusicOsc();
    this._hydrateLevels();
  }

  duckMusic(ratio) {
    this._duck = Number.isFinite(ratio) ? Math.min(1, Math.max(0.05, ratio)) : 0.35;
    if (!this._musicGain || !this._ctx) return;
    const s = getAudioSettings(),
      gn = this._musicGain.gain;
    gn.cancelScheduledValues(this._ctx.currentTime);
    gn.setTargetAtTime((s.muted ? 0 : s.music) * this._duck, this._ctx.currentTime, 0.08);
  }

  restoreMusic() {
    this._duck = 1;
    this._hydrateLevels();
  }

  setMaster(v) {
    setAudioSettings({ master: v });
    this._hydrateLevels();
  }
  setMusic(v) {
    setAudioSettings({ music: v });
    this._hydrateLevels();
  }
  setSfx(v) {
    setAudioSettings({ sfx: v });
    this._hydrateLevels();
  }
  setMuted(v) {
    setAudioSettings({ muted: !!v });
    this._hydrateLevels();
    if (getAudioSettings().muted) return void this._disconnectMusicOsc();
    void this._ctx?.resume?.();
    if (this._musicName) this.playMusic(this._musicName);
  }

  getVolumes() {
    return getAudioSettings();
  }

  _bindGameEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;
    const sfx = /** @type {const} */ [
      [GAME_EVENT.ENEMY_HIT, () => this.playSfx("enemy-hit")],
      [GAME_EVENT.ENEMY_KILLED, () => this.playSfx("enemy-death")],
      [GAME_EVENT.WAVE_STARTED, () => this.playSfx("wave-start")],
      [GAME_EVENT.BOSS_ALERT, () => this.playSfx("boss-spawn")],
      [GAME_EVENT.TOWER_FIRE, () => this.playSfx("tower-fire")],
      [GAME_EVENT.TOWER_BUILD_STARTED, () => this.playSfx("build-start")],
      [GAME_EVENT.TOWER_BUILT, () => this.playSfx("build-complete")],
      [GAME_EVENT.TOWER_UPGRADED, () => this.playSfx("upgrade")],
      [GAME_EVENT.TOWER_SOLD, () => this.playSfx("sell")],
      [GAME_EVENT.TOWER_CONVERTED, () => this.playSfx("convert")],
    ];
    for (const [ev, fn] of sfx) gameEvents.on(ev, fn);
    gameEvents.on(GAME_EVENT.ENEMY_LEAK, () => {
      this.playSfx("leak");
      this.duckMusic(0.4);
      setTimeout(() => this.restoreMusic(), 850);
    });
    gameEvents.on(GAME_EVENT.RUN_END, (p) => {
      if (p?.victory === true || p?.won === true) this.playSfx("victory");
      else if (p?.victory === false || p?.defeat === true || p?.lost === true) this.playSfx("defeat");
    });
    gameEvents.on(GAME_EVENT.PAUSE_CHANGED, (p) => {
      if (p?.paused) this.playSfx("pause");
    });
  }
}

export const audioManager = new AudioManager();
