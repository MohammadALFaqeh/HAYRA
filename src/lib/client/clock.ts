"use client";
import { useEffect, useRef, useState } from "react";
import type { TimerState } from "@/lib/game/types";

// فرق التوقيت بين الجهاز والسيرفر (ms) — لتزامن المؤقت بين التلفزيون والجوال
let offset = 0;
let synced = false;

export const serverNow = () => Date.now() + offset;

export async function syncClock(): Promise<void> {
  try {
    const samples: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now();
      const res = await fetch("/api/time", { cache: "no-store" });
      const { now } = (await res.json()) as { now: number };
      const t1 = Date.now();
      samples.push(now - (t0 + t1) / 2);
    }
    samples.sort((a, b) => a - b);
    offset = samples[1];
    synced = true;
  } catch {
    /* نبقى على توقيت الجهاز */
  }
}

/** تحديث تقريبي للفرق من حقل serverTime المرسل مع الحالة (إذا لم تتم المزامنة) */
export function hintServerTime(serverTime: number | undefined) {
  if (!synced && serverTime) offset = serverTime - Date.now();
}

export function useClockSync() {
  useEffect(() => {
    void syncClock();
    const i = setInterval(syncClock, 5 * 60_000);
    return () => clearInterval(i);
  }, []);
}

/** الوقت المتبقي بالميلي ثانية، يتحدث ~10 مرات في الثانية */
export function useCountdown(timer: TimerState | null | undefined): number {
  const [remaining, setRemaining] = useState(() => calc(timer));
  const ref = useRef(timer);
  ref.current = timer;
  useEffect(() => {
    setRemaining(calc(timer));
    if (!timer?.running) return;
    const i = setInterval(() => setRemaining(calc(ref.current)), 100);
    return () => clearInterval(i);
  }, [timer?.running, timer?.endsAt, timer?.remainingMs, timer]);
  return remaining;
}

function calc(t: TimerState | null | undefined): number {
  if (!t) return 0;
  if (!t.running || t.endsAt === null) return Math.max(0, t.remainingMs);
  return Math.max(0, t.endsAt - serverNow());
}
