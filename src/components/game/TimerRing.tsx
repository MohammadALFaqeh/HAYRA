"use client";
import { useEffect, useRef } from "react";
import { useCountdown } from "@/lib/client/clock";
import { play } from "@/lib/client/sound";
import type { TimerState } from "@/lib/game/types";
import { cn, seconds } from "@/lib/utils";

export function TimerRing({ timer, size = 140, sound = false }: { timer: TimerState; size?: number; sound?: boolean }) {
  const remaining = useCountdown(timer);
  const secs = seconds(remaining);
  const pct = timer.durationMs > 0 ? Math.min(1, remaining / timer.durationMs) : 0;
  const r = 44;
  const circ = 2 * Math.PI * r;
  const danger = secs <= 5 && (timer.running || timer.expired);
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    if (!sound || !timer.running) return;
    if (secs <= 5 && secs > 0 && lastTick.current !== secs) {
      lastTick.current = secs;
      play("tick");
    }
  }, [secs, sound, timer.running]);

  if (!timer.label) return null;
  const color = timer.label === "steal" ? "#4f93ff" : danger ? "#d9435c" : "#ffcb3d";

  return (
    <div className={cn("relative grid place-items-center", danger && timer.running && "animate-pulse")} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r={r} stroke="rgba(255,255,255,.08)" strokeWidth="8" fill="none" />
        <circle
          cx="50"
          cy="50"
          r={r}
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          style={{ transition: "stroke-dashoffset .1s linear, stroke .3s", filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="text-center">
        <div className="font-display font-extrabold tabular-nums leading-none" style={{ fontSize: size * 0.34, color }}>
          {timer.expired ? "0" : secs}
        </div>
        <div className="mt-1 text-[11px] text-white/55" style={{ fontSize: Math.max(10, size * 0.085) }}>
          {timer.expired ? "انتهى الوقت" : !timer.running ? "متوقف ⏸" : timer.label === "steal" ? "وقت السرقة" : "ثانية"}
        </div>
      </div>
    </div>
  );
}
