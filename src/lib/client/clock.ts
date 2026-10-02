"use client";
import { useEffect, useRef, useState } from "react";
import type { TimerState } from "@/lib/game/types";

// فرق التوقيت بين الجهاز والسيرفر (ms) — لتزامن المؤقت بين التلفزيون والجوال
let offset = 0;
let synced = false;

/** ساعة الجهاز الرتيبة (لا تقفز مع تعديلات ساعة النظام مثل Date.now) */
const localNow = () =>
  typeof performance !== "undefined" && performance.timeOrigin ? performance.timeOrigin + performance.now() : Date.now();

export const serverNow = () => localNow() + offset;

/**
 * مزامنة على طريقة NTP: عدة عينات، ونعتمد العينة ذات أقل زمن ذهاب وإياب
 * (أدقها)، ونتجاهل العينات الفاشلة بدل إلغاء المزامنة كلها.
 */
export async function syncClock(): Promise<void> {
  let best: { rtt: number; offset: number } | null = null;
  for (let i = 0; i < 5; i++) {
    try {
      const t0 = localNow();
      const res = await fetch("/api/time", { cache: "no-store" });
      const { now } = (await res.json()) as { now: number };
      const t1 = localNow();
      if (!Number.isFinite(now)) continue;
      const rtt = t1 - t0;
      if (!best || rtt < best.rtt) best = { rtt, offset: now - (t0 + t1) / 2 };
    } catch {
      /* عينة فاشلة — نكمل */
    }
  }
  if (best) {
    offset = best.offset;
    synced = true;
  }
}

/** تقدير مؤقت للفرق من وقت رد السيرفر — فقط قبل نجاح أول مزامنة، ومن قيمة «طازجة» */
export function hintServerTime(serverTime: number | undefined) {
  if (!synced && serverTime) offset = serverTime - localNow();
}

export function useClockSync() {
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      await syncClock();
      // إعادة سريعة إذا فشلت المزامنة، وإلا تحديث دوري
      if (alive) timer = setTimeout(run, synced ? 2 * 60_000 : 5_000);
    };
    void run();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
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

export type SecondsPhase = "idle" | "countdown" | "flash" | "hidden" | "stopped";

/**
 * حالة عداد «ملك الثواني» بتوقيت السيرفر، تتحدث مع كل إطار للعرض الدقيق:
 * countdown (3-2-1) → flash (العداد ظاهر) → hidden (مخفي) → stopped
 *
 * فرق الساعة يُثبَّت لحظة بدء الجولة: لو تغيّرت المزامنة في منتصف العد
 * لتغيّرت المدة التي يراها اللاعبون — وهي جوهر اللعبة.
 */
export function useSecondsClock(startsAt: number | null, stopsAt: number | null, flashMs: number) {
  const frozen = useRef<{ startsAt: number | null; offset: number }>({ startsAt: null, offset });
  if (frozen.current.startsAt !== startsAt) frozen.current = { startsAt, offset };
  const roundNow = () => localNow() + frozen.current.offset;

  const [now, setNow] = useState(roundNow);
  const stopped = startsAt !== null && stopsAt !== null && now >= stopsAt;
  useEffect(() => {
    setNow(roundNow());
    if (startsAt === null || stopsAt === null || roundNow() >= stopsAt) return;
    let raf = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const loop = () => {
      const n = roundNow();
      setNow(n);
      if (n >= stopsAt) return;
      // أثناء الإخفاء لا حاجة للتحديث كل إطار: ننتظر لحظة التوقف مباشرة
      if (n >= startsAt + flashMs) timeout = setTimeout(() => (raf = requestAnimationFrame(loop)), Math.max(0, stopsAt - n - 30));
      else raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
    // roundNow يعتمد على ref ثابت
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startsAt, stopsAt, flashMs]);

  let phase: SecondsPhase = "idle";
  if (startsAt !== null && stopsAt !== null) {
    if (now < startsAt) phase = "countdown";
    else if (stopped) phase = "stopped";
    else if (now < startsAt + flashMs) phase = "flash";
    else phase = "hidden";
  }
  return {
    phase,
    countdown: startsAt !== null ? Math.max(0, Math.ceil((startsAt - now) / 1000)) : 0,
    elapsedMs: startsAt !== null ? Math.max(0, Math.min(now, stopsAt ?? now) - startsAt) : 0,
  };
}
