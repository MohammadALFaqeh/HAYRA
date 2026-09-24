"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import type { LastEvent, TeamId, TeamState } from "@/lib/game/types";
import { MYSTERY, POWERUPS } from "@/lib/game/constants";
import { play } from "@/lib/client/sound";
import { cn, formatPoints, TEAM_COLORS } from "@/lib/utils";

interface Shown {
  id: number;
  emoji: string;
  title: string;
  comment: string | null;
  sub?: string | null;
  tone: "good" | "bad" | "info" | "mystery";
  team: TeamId | null;
}

function burst(team: TeamId | null, big = false) {
  const colors = team === "B" ? ["#4f93ff", "#a672ff", "#ffffff"] : ["#ffcb3d", "#ffe9a3", "#ff8a1f"];
  confetti({ particleCount: big ? 220 : 110, spread: big ? 120 : 80, origin: { y: 0.6 }, colors, disableForReducedMotion: true });
}

/**
 * طبقة الأحداث على التلفزيون: تعليق عربي مضحك + صوت + قصاصات عند الإجابة الصحيحة.
 * لا تعيد عرض الحدث الأخير عند تحديث الصفحة.
 */
export function EventOverlay({ event, teams, sound = true }: { event: LastEvent | null; teams: Record<TeamId, TeamState>; sound?: boolean }) {
  const seen = useRef<number | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    if (!event) return;
    if (seen.current === null) {
      seen.current = event.id; // أول تحميل: لا نعرض
      return;
    }
    if (event.id <= seen.current) {
      seen.current = event.id;
      return;
    }
    seen.current = event.id;
    const team = event.team ? teams[event.team] : null;
    let s: Shown | null = null;
    const snd = (n: Parameters<typeof play>[0]) => sound && play(n);

    switch (event.kind) {
      case "correct":
      case "steal_correct": {
        const streakLine = (event.meta?.streakLine as string | null) ?? null;
        s = {
          id: event.id,
          emoji: event.kind === "steal_correct" ? "🦊" : "✅",
          title: `${team?.name ?? ""} +${formatPoints(event.points)}`,
          comment: event.comment,
          sub: streakLine ? `${streakLine} (+${event.meta?.streakBonus})` : null,
          tone: "good",
          team: event.team,
        };
        snd(streakLine ? "streak" : "correct");
        burst(event.team, event.points >= 500 || !!streakLine);
        break;
      }
      case "wrong":
        s = { id: event.id, emoji: "❌", title: event.meta?.transfer ? "خطأ! السؤال يتحول 🔄" : "خطأ!", comment: event.comment, tone: "bad", team: event.team };
        snd("wrong");
        break;
      case "transfer":
        s = { id: event.id, emoji: "🔄", title: `فرصة سرقة لـ ${team?.name ?? ""}`, comment: null, tone: "info", team: event.team };
        snd("steal");
        break;
      case "timeup":
        s = { id: event.id, emoji: "⏰", title: "انتهى الوقت!", comment: event.comment, tone: "bad", team: null };
        snd("timeup");
        break;
      case "reveal":
        s = { id: event.id, emoji: "👀", title: "الإجابة الصحيحة", comment: event.comment, tone: "info", team: null };
        snd("reveal");
        break;
      case "mystery": {
        const k = event.meta?.mystery as keyof typeof MYSTERY;
        const m = MYSTERY[k];
        s = {
          id: event.id,
          emoji: m?.icon ?? "❓",
          title: m?.name ?? "خانة غامضة",
          comment: m?.desc ?? null,
          sub: event.points ? `+${event.points} لـ ${team?.name ?? ""}` : null,
          tone: "mystery",
          team: event.team,
        };
        snd("mystery");
        break;
      }
      case "powerup": {
        const p = POWERUPS[event.meta?.powerup as keyof typeof POWERUPS];
        s = { id: event.id, emoji: p?.icon ?? "⚡", title: `${team?.name ?? ""}: ${p?.name ?? ""}`, comment: p?.desc ?? null, tone: "info", team: event.team };
        snd("powerup");
        break;
      }
      case "score":
        s = {
          id: event.id,
          emoji: event.points >= 0 ? "➕" : "➖",
          title: `${team?.name ?? "الفريق"} ${event.points >= 0 ? "+" : ""}${formatPoints(event.points)}`,
          comment: "تعديل نقاط بواسطة المضيف",
          tone: event.points >= 0 ? "good" : "bad",
          team: event.team,
        };
        snd(event.points >= 0 ? "correct" : "wrong");
        break;
      case "open":
        snd("open");
        break;
      case "final_result":
        s = {
          id: event.id,
          emoji: event.points >= 0 ? "💰" : "💸",
          title: `${team?.name ?? ""} ${event.points >= 0 ? "+" : ""}${formatPoints(event.points)}`,
          comment: event.comment,
          tone: event.points >= 0 ? "good" : "bad",
          team: event.team,
        };
        if (event.points >= 0) {
          snd("correct");
          burst(event.team);
        } else snd("wrong");
        break;
      case "finish":
        snd("win");
        burst(event.team, true);
        setTimeout(() => burst(event.team, true), 700);
        break;
      default:
        break;
    }
    if (s) setShown(s);
  }, [event, teams, sound]);

  // مؤقت الإخفاء مستقل عن تحديثات الحالة، حتى لا تبقى الرسالة معلّقة على الشاشة
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown((cur) => (cur?.id === shown.id ? null : cur)), shown.tone === "good" ? 3000 : 2200);
    return () => clearTimeout(t);
  }, [shown]);

  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key={shown.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-night-950/55 backdrop-blur-[2px]"
        >
          <motion.div
            initial={{ scale: 0.5, rotate: -4 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 16 }}
            className={cn(
              "mx-4 max-h-[82dvh] max-w-3xl overflow-y-auto rounded-[2rem] border-2 px-5 py-6 text-center shadow-2xl sm:mx-6 sm:rounded-[2.5rem] sm:px-10 sm:py-8",
              shown.tone === "good" && (shown.team === "B" ? "border-volt-400 bg-night-850" : "border-gold-400 bg-night-850"),
              shown.tone === "bad" && "border-wine-400 bg-night-850",
              shown.tone === "info" && "border-white/20 bg-night-850",
              shown.tone === "mystery" && "border-violet-400 bg-night-850 shadow-[0_0_80px_rgba(139,69,245,.5)]",
            )}
          >
            <div className="text-5xl sm:text-7xl lg:text-8xl">{shown.emoji}</div>
            <div className={cn("mt-2 font-display text-3xl font-extrabold sm:text-4xl lg:text-6xl", shown.team && shown.tone === "good" && TEAM_COLORS[shown.team].text)}>
              {shown.title}
            </div>
            {shown.comment && <div className="mt-3 text-lg text-white/85 sm:text-2xl lg:text-3xl">{shown.comment}</div>}
            {shown.sub && <div className="mt-2 text-xl text-ember-400 lg:text-2xl">{shown.sub}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
