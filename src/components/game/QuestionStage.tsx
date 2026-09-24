"use client";
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import type { PublicActive } from "@/lib/game/public";
import type { TeamId, TeamState, TimerState } from "@/lib/game/types";
import { MYSTERY, POWERUPS, isQrType } from "@/lib/game/constants";
import { cn, formatPoints, TEAM_COLORS } from "@/lib/utils";
import { TimerRing } from "./TimerRing";

const LETTERS = ["أ", "ب", "ج", "د", "هـ", "و"];

export function QuestionStage({
  active,
  teams,
  timer,
  origin,
  sound,
  isFinal,
}: {
  active: PublicActive;
  teams: Record<TeamId, TeamState>;
  timer: TimerState;
  origin: string;
  sound?: boolean;
  isFinal?: boolean;
}) {
  const q = active.question;
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // المضيف يضغط «تشغيل» → يزيد mediaCue → نعيد التشغيل على التلفزيون
  useEffect(() => {
    if (active.mediaCue <= 0) return;
    const el = audioRef.current ?? videoRef.current;
    if (el) {
      el.currentTime = 0;
      void el.play().catch(() => undefined);
    }
  }, [active.mediaCue]);

  if (!q) return null;
  const team = teams[active.answeringTeam];
  const tc = TEAM_COLORS[active.answeringTeam];
  const points = active.basePoints * active.multiplier * (active.doubleFor === active.answeringTeam ? 2 : 1);
  const qr = isQrType(q.type);
  const showAnswer = q.answer !== null;

  return (
    <motion.div
      key={q.id}
      initial={{ opacity: 0, scale: 0.985, y: 14 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.38, ease: "easeOut" }}
      className="question-stage flex h-full flex-col gap-4 rounded-[1.75rem] p-4 lg:gap-6 lg:p-6"
    >
      {/* رأس السؤال */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded-2xl bg-white/[0.07] px-4 py-2 font-display text-lg font-bold lg:text-2xl">
            {q.categoryTitle}
            {q.subcategoryName && <span className="text-white/50"> / {q.subcategoryName}</span>}
          </span>
          {!isFinal && (
            <span className="gold-text font-display text-3xl font-extrabold lg:text-5xl">{formatPoints(points)}</span>
          )}
          {isFinal && <span className="gold-text font-display text-3xl font-extrabold lg:text-5xl">السؤال النهائي 👑</span>}
          {active.mystery && (
            <span className="rounded-full bg-violet-500/25 px-3 py-1 text-sm font-bold text-violet-400 lg:text-base">
              {MYSTERY[active.mystery].icon} {MYSTERY[active.mystery].name}
            </span>
          )}
          {active.noSteal && !isFinal && <span className="rounded-full bg-white/10 px-3 py-1 text-sm">🛡️ بدون سرقة</span>}
          {active.powerupsUsed.map((p, i) => (
            <span key={i} className={cn("rounded-full px-3 py-1 text-sm font-semibold", TEAM_COLORS[p.team].text, "bg-white/[0.06]")}>
              {POWERUPS[p.powerup].icon} {POWERUPS[p.powerup].name}
            </span>
          ))}
        </div>
        {!isFinal && (
          <div className={cn("rounded-2xl px-4 py-2 font-display text-lg font-bold lg:text-2xl", "bg-white/[0.06]", tc.text)}>
            {active.stage === "stealing" ? "🦊 فرصة سرقة: " : "🎯 الدور: "}
            {team.name}
          </div>
        )}
      </div>

      {/* جسم السؤال */}
      <div className="grid flex-1 items-center gap-6 lg:grid-cols-[1fr_auto]">
        <div className="space-y-5">
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl font-display text-[clamp(1.45rem,3.6vw,3.6rem)] font-extrabold leading-snug text-balance"
          >
            {q.text}
          </motion.h2>

          {q.quote && (
            <p className="quran rounded-3xl border border-gold-400/20 bg-gold-400/[0.06] px-6 py-4 text-[clamp(1.5rem,3vw,3rem)] text-gold-200">
              ﴿ {q.quote} ﴾
            </p>
          )}

          {q.type === "individual" && q.target && (
            <div className="rounded-2xl border border-volt-400/30 bg-volt-500/10 px-4 py-3 text-lg font-bold text-volt-400">
              🎯 السؤال الفردي لـ: {q.target}
            </div>
          )}

          {q.imageUrl && !qr && (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={q.imageUrl}
                alt=""
                className="max-h-[42vh] max-w-full rounded-3xl border border-white/10 bg-white/[0.03] object-contain p-2 shadow-2xl"
              />
            </div>
          )}
          {q.audioUrl && !qr && (
            <div className="flex items-center gap-3 rounded-2xl bg-white/[0.05] p-3">
              <span className="text-3xl">🔊</span>
              <audio ref={audioRef} src={q.audioUrl} controls className="w-full" preload="auto" />
            </div>
          )}
          {q.videoUrl && !qr && (
            <video ref={videoRef} src={q.videoUrl} controls className="max-h-[45vh] w-full rounded-3xl" preload="auto" />
          )}

          {q.clues.length > 0 && (
            <ol className="space-y-2">
              {q.clues.map((c, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-4 py-3 text-[clamp(1rem,1.8vw,1.6rem)]"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold-400 font-bold text-night-950">{i + 1}</span>
                  {c}
                </motion.li>
              ))}
              {q.cluesTotal > q.clues.length && (
                <li className="text-sm text-white/40">🔒 {q.cluesTotal - q.clues.length} تلميحات متبقية</li>
              )}
            </ol>
          )}

          {q.type === "reverse_points" && (
            <div className="rounded-2xl border border-gold-400/20 bg-gold-400/[0.06] px-4 py-3 text-lg font-bold text-gold-200">
              🏁 كل فريق لديه محاولتان — اذكروا إجابتين، والنقاط حسب ترتيب الإجابة الصحيحة.
              <div className="mt-2 flex gap-4 text-sm font-semibold text-white/70">
                <span>الفريق الأول: {active.rankAttempts.A}/2</span>
                <span>الفريق الثاني: {active.rankAttempts.B}/2</span>
              </div>
            </div>
          )}

          {q.choices && q.type !== "reverse_points" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {q.choices.map((c, i) => {
                const removed = q.removedChoices.includes(i);
                const correct = showAnswer && c === q.answer;
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border px-4 py-3 text-[clamp(1rem,1.9vw,1.7rem)] font-semibold transition",
                      removed ? "border-white/5 opacity-20 line-through" : "border-white/10 bg-white/[0.05]",
                      correct && "border-leaf-400 bg-leaf-500/20 text-leaf-400",
                    )}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-night-700 font-display">{LETTERS[i]}</span>
                    {q.type === "reverse_points" && <span className="text-xs text-gold-300">المركز {i + 1}</span>}
                    {c}
                  </div>
                );
              })}
            </div>
          )}

          {qr && active.qrToken && !showAnswer && (
            <div className="flex flex-col items-center gap-4 rounded-3xl bg-white/[0.04] p-5 sm:flex-row">
              <div className="rounded-2xl bg-white p-3">
                <QRCodeSVG value={`${origin}/qr/${active.qrToken}`} size={200} level="M" />
              </div>
              <div className="space-y-2 text-center sm:text-right">
                <p className="font-display text-2xl font-bold">📱 شخص واحد من {team.name} يمسح الرمز</p>
                <p className="text-white/60">سيظهر له التحدي على جواله فقط — لا تفرجوا الباقين!</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-center lg:flex-col lg:items-center">
          <TimerRing timer={timer} size={180} sound={sound} />
        </div>
      </div>

      {/* الإجابة */}
      <AnimatePresence>
        {showAnswer && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative overflow-hidden rounded-3xl border-2 border-leaf-400/60 bg-leaf-500/15 px-6 py-4 text-center shadow-[0_0_50px_-18px_rgba(86,211,139,.8)]"
          >
            <div className="text-sm text-leaf-400">الإجابة</div>
            <div className={cn("font-display text-[clamp(1.6rem,3.4vw,3.2rem)] font-extrabold", q.answerIsQuote && "quran font-normal")}>
              {q.answerIsQuote ? `﴿ ${q.answer} ﴾` : q.answer}
            </div>
            {q.explanation && <div className="mt-1 text-white/65">{q.explanation}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
