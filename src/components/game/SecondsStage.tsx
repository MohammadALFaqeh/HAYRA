"use client";
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useSecondsClock } from "@/lib/client/clock";
import { play } from "@/lib/client/sound";
import type { PublicSeconds } from "@/lib/game/public";
import { SECONDS_FLASH_MS, SECONDS_LEVELS, formatSecondsDiff, formatSecondsMs } from "@/lib/game/seconds";
import type { TeamId, TeamState } from "@/lib/game/types";
import { cn, formatPoints, TEAM_COLORS } from "@/lib/utils";

/** شاشة «ملك الثواني» على التلفزيون */
export function SecondsStage({ round: r, teams, sound }: { round: PublicSeconds; teams: Record<TeamId, TeamState>; sound?: boolean }) {
  const lv = SECONDS_LEVELS[r.level];
  const clock = useSecondsClock(r.startsAt, r.stopsAt, SECONDS_FLASH_MS);
  const team = teams[r.answeringTeam];
  const tc = TEAM_COLORS[r.answeringTeam];

  // أصوات: تكة مع كل رقم في العد التنازلي، ثم بداية، ثم توقف
  const lastCue = useRef<string | null>(null);
  useEffect(() => {
    if (!sound || r.startsAt === null) return;
    const cue = clock.phase === "countdown" ? `c${clock.countdown}` : clock.phase === "flash" ? "go" : clock.phase === "stopped" ? "stop" : null;
    const key = `${r.startsAt}:${cue}`;
    if (!cue || lastCue.current === key) return;
    // لا نعيد تشغيل صوت التوقف عند فتح الشاشة بعد انتهاء العد
    const first = lastCue.current === null || !lastCue.current.startsWith(`${r.startsAt}:`);
    lastCue.current = key;
    if (first && cue === "stop") return;
    play(cue === "go" ? "open" : cue === "stop" ? "timeup" : "tick");
  }, [sound, r.startsAt, clock.phase, clock.countdown]);

  const running = r.stage === "running" || r.stage === "missed";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.985, y: 14 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.38, ease: "easeOut" }}
      className="question-stage flex h-full flex-col gap-4 rounded-[1.75rem] p-4 lg:gap-6 lg:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-2xl bg-white/[0.07] px-4 py-2 font-display text-lg font-bold lg:text-2xl">👑 ملك الثواني</span>
          <span className="gold-text font-display text-3xl font-extrabold lg:text-5xl">{formatPoints(r.points)}</span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold lg:text-base">
            {lv.name} · هامش ±{formatSecondsMs(lv.toleranceMs, 2)} ث
          </span>
        </div>
        {r.stage !== "done" && (
          <div className={cn("font-display text-xl font-bold lg:text-3xl", tc.text)}>
            {r.answeringTeam !== r.pickedBy ? "🦊 فرصة سرقة لـ " : "🎯 "}
            {team.name}
          </div>
        )}
      </div>

      <div className="grid flex-1 place-items-center text-center">
        {r.stage === "ready" && (
          <div className="max-w-3xl space-y-5">
            <div className="text-7xl lg:text-9xl">⏱️</div>
            <p className="font-display text-3xl font-extrabold leading-relaxed lg:text-5xl">
              العداد سيظهر لحظة ثم يختفي… <span className="gold-text">عدّوا في رؤوسكم!</span>
            </p>
            <p className="text-xl text-white/70 lg:text-2xl">
              عندما يتوقف، قولوا كم ثانية مرّت بالضبط. الإجابة تُقبل إذا كان الفرق ±{formatSecondsMs(lv.toleranceMs, 2)} ثانية أو أقل
              {r.level === 3 && " — والوقت بأجزاء أجزاء الثانية"}.
            </p>
          </div>
        )}

        {running && clock.phase === "countdown" && (
          <motion.div key={clock.countdown} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="gold-text font-display text-[10rem] font-extrabold leading-none lg:text-[16rem]">
            {clock.countdown}
          </motion.div>
        )}

        {running && clock.phase === "flash" && (
          <div className="font-display text-[7rem] font-extrabold tabular-nums leading-none text-white lg:text-[13rem]" dir="ltr">
            {formatSecondsMs(clock.elapsedMs, 2)}
          </div>
        )}

        {running && clock.phase === "hidden" && (
          <div className="space-y-6">
            <div className="animate-pulse font-display text-[7rem] font-extrabold leading-none text-white/25 lg:text-[13rem]" dir="ltr">
              ?.??
            </div>
            <div className="text-2xl text-white/60 lg:text-3xl">العداد شغّال… 🤫</div>
          </div>
        )}

        {running && clock.phase === "stopped" && (
          <div className="space-y-6">
            <div className="font-display text-7xl font-extrabold text-wine-400 lg:text-9xl">⏹ توقف!</div>
            {r.stage === "missed" ? (
              <div className="space-y-2">
                <div className="text-3xl font-bold lg:text-4xl">
                  ❌ {teams[r.pickedBy].name}: <span dir="ltr">{formatSecondsMs(r.guesses[0]?.guessMs ?? 0, lv.decimals)}</span> ثانية
                </div>
                <div className="text-xl text-white/60 lg:text-2xl">خارج الهامش… هل يسرقها {teams[r.pickedBy === "A" ? "B" : "A"].name}؟</div>
              </div>
            ) : (
              <div className={cn("font-display text-3xl font-bold lg:text-5xl", tc.text)}>كم ثانية يا {team.name}؟ 🤔</div>
            )}
            {r.stage === "running" && r.guesses.length > 0 && (
              <div className="text-xl text-white/60">
                ❌ {teams[r.guesses[0].team].name} قال <span dir="ltr">{formatSecondsMs(r.guesses[0].guessMs, lv.decimals)}</span>
              </div>
            )}
          </div>
        )}

        {r.stage === "done" && r.targetMs !== null && (
          <div className="w-full max-w-3xl space-y-6">
            <div className="text-xl text-white/60 lg:text-2xl">الوقت الحقيقي</div>
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="gold-text font-display text-[6rem] font-extrabold tabular-nums leading-none lg:text-[10rem]"
              dir="ltr"
            >
              {formatSecondsMs(r.targetMs, lv.decimals)}
            </motion.div>
            <div className="space-y-2">
              {r.guesses.map((g, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-2xl border px-5 py-3 text-xl font-bold lg:text-3xl",
                    g.correct ? "border-leaf-400/60 bg-leaf-500/15" : "border-wine-400/50 bg-wine-500/10",
                  )}
                >
                  <span className={TEAM_COLORS[g.team].text}>
                    {g.correct ? "✅" : "❌"} {teams[g.team].name}
                  </span>
                  <span dir="ltr" className="tabular-nums">
                    {formatSecondsMs(g.guessMs, lv.decimals)}
                    {g.diffMs !== null && <span className="ms-3 text-base text-white/55 lg:text-xl">({formatSecondsDiff(g.diffMs, lv.decimals)})</span>}
                  </span>
                </div>
              ))}
            </div>
            <div className="font-display text-3xl font-extrabold lg:text-5xl">
              {r.winner ? (
                <span className={TEAM_COLORS[r.winner].text}>👑 {teams[r.winner].name} ملك الثواني! +{formatPoints(r.points)}</span>
              ) : (
                <span className="text-white/70">لا أحد أصاب هذه المرة 😅</span>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
