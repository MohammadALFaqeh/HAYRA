"use client";
// مؤثرات صوتية مُولّدة بـ WebAudio (بدون ملفات) + كتم محفوظ
export type SoundName = "open" | "correct" | "wrong" | "tick" | "timeup" | "steal" | "reveal" | "mystery" | "powerup" | "win" | "click" | "streak";

const MUTE_KEY = "hayra:mute";
let ctx: AudioContext | null = null;
let muted: boolean | null = null;
const listeners = new Set<(m: boolean) => void>();

export function isMuted(): boolean {
  if (muted === null) muted = typeof window !== "undefined" && localStorage.getItem(MUTE_KEY) === "1";
  return muted;
}
export function setMuted(v: boolean) {
  muted = v;
  try {
    localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l(v));
}
export function onMuteChange(fn: (m: boolean) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** يجب استدعاؤها بعد أول لمسة/نقرة لتفعيل الصوت في المتصفح */
export function unlockAudio() {
  audio();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.18, slideTo?: number) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

const SOUNDS: Record<SoundName, () => void> = {
  click: () => tone(660, 0, 0.06, "triangle", 0.08),
  tick: () => tone(1200, 0, 0.05, "square", 0.05),
  open: () => {
    tone(392, 0, 0.12, "triangle");
    tone(523, 0.1, 0.12, "triangle");
    tone(784, 0.2, 0.25, "triangle");
  },
  correct: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.22, "triangle", 0.2));
  },
  streak: () => {
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.06, 0.2, "square", 0.08));
  },
  wrong: () => {
    tone(220, 0, 0.35, "sawtooth", 0.12, 110);
    tone(180, 0.12, 0.35, "sawtooth", 0.1, 90);
  },
  timeup: () => {
    tone(880, 0, 0.18, "square", 0.1);
    tone(660, 0.2, 0.18, "square", 0.1);
    tone(440, 0.4, 0.4, "square", 0.1);
  },
  steal: () => tone(300, 0, 0.45, "sawtooth", 0.1, 900),
  reveal: () => {
    tone(587, 0, 0.3, "sine", 0.15);
    tone(880, 0.12, 0.4, "sine", 0.12);
  },
  mystery: () => {
    [330, 415, 494, 622, 740, 880].forEach((f, i) => tone(f, i * 0.07, 0.25, "sine", 0.12));
  },
  powerup: () => tone(400, 0, 0.35, "triangle", 0.15, 1600),
  win: () => {
    const notes = [523, 523, 523, 659, 784, 659, 784, 1047];
    notes.forEach((f, i) => tone(f, i * 0.14, 0.3, "triangle", 0.2));
  },
};

export function play(name: SoundName) {
  if (isMuted()) return;
  try {
    SOUNDS[name]();
  } catch {
    /* ignore */
  }
}
