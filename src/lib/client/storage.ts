"use client";
// تخزين محلي: مفتاح المضيف لكل جلسة + آخر جلسة نشطة + معرّف الجهاز لتحديات QR

const hostKeyName = (id: string) => `hayra:host:${id}`;
const LAST_SESSION = "hayra:last-session";
const DEVICE = "hayra:device";

function safe<T>(fn: () => T, fb: T): T {
  try {
    return fn();
  } catch {
    return fb;
  }
}

export const getHostKey = (id: string) => safe(() => localStorage.getItem(hostKeyName(id)), null);
export const setHostKey = (id: string, key: string) =>
  safe(() => {
    localStorage.setItem(hostKeyName(id), key);
    localStorage.setItem(LAST_SESSION, JSON.stringify({ id, at: Date.now() }));
  }, undefined);
export const forgetSession = (id: string) =>
  safe(() => {
    localStorage.removeItem(hostKeyName(id));
    localStorage.removeItem(`hayra:queue:${id}`);
    const last = getLastSession();
    if (last?.id === id) localStorage.removeItem(LAST_SESSION);
  }, undefined);

export function getLastSession(): { id: string; at: number } | null {
  return safe(() => {
    const raw = localStorage.getItem(LAST_SESSION);
    if (!raw) return null;
    const v = JSON.parse(raw) as { id: string; at: number };
    if (Date.now() - v.at > 12 * 3600_000 || !getHostKey(v.id)) return null;
    return v;
  }, null);
}

export function getDeviceId(): string {
  return safe(() => {
    let id = localStorage.getItem(DEVICE);
    if (!id) {
      const bytes = crypto.getRandomValues(new Uint8Array(12));
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(DEVICE, id);
    }
    return id;
  }, "anon-device-" + Math.random().toString(36).slice(2, 10));
}

/** مسودة إنشاء اللعبة (بين صفحات المعالج) */
export const DRAFT_KEY = "hayra:draft";
export function readDraft<T>(): T | null {
  return safe(() => {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  }, null);
}
export function writeDraft<T>(v: T) {
  safe(() => sessionStorage.setItem(DRAFT_KEY, JSON.stringify(v)), undefined);
}
export function clearDraft() {
  safe(() => sessionStorage.removeItem(DRAFT_KEY), undefined);
}
