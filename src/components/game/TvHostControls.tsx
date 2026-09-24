"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, ChevronUp, Eye, Pause, Play, Plus, SkipForward, X } from "lucide-react";
import { useCountdown } from "@/lib/client/clock";
import { play, unlockAudio } from "@/lib/client/sound";
import type { useHostSession } from "@/lib/client/use-host-session";
import type { PublicState } from "@/lib/game/public";
import type { TeamId } from "@/lib/game/types";
import { cn, TEAM_COLORS } from "@/lib/utils";

type Host = ReturnType<typeof useHostSession>;

/**
 * أزرار تحكم على شاشة العرض — تظهر فقط على جهاز المضيف (نفس المتصفح الذي أنشأ اللعبة).
 * لا تعرض الإجابة أبدًا، لتبقى الشاشة آمنة للمشاركة.
 */
export function TvHostControls({ host, state }: { host: Host; state: PublicState }) {
  const [open, setOpen] = useState(true);
  const remaining = useCountdown(state.timer);
  const timeUpSent = useRef<number | null>(null);
  const act = (a: Parameters<Host["dispatch"]>[0]) => {
    unlockAudio();
    play("click");
    void host.dispatch(a);
  };

  // انتهاء الوقت يُرسل من هنا أيضًا إن لم تكن لوحة المضيف مفتوحة
  useEffect(() => {
    const t = state.timer;
    if (t.running && t.endsAt && remaining <= 0 && timeUpSent.current !== t.endsAt) {
      timeUpSent.current = t.endsAt;
      void host.dispatch({ type: "TIME_UP" });
    }
  }, [remaining, state.timer, host]);

  const a = state.active;
  const f = state.final;
  let buttons: React.ReactNode = null;

  if (state.phase === "question" && a) {
    const settled = a.stage === "resolved" || a.stage === "revealed" || a.stage === "failed";
    const other: TeamId = a.pickedBy === "A" ? "B" : "A";
    const ranking = a.question?.type === "reverse_points";
    buttons = settled ? (
      <Btn tone="gold" onClick={() => act({ type: "BACK_TO_BOARD" })}>
        العودة للوحة ↩
      </Btn>
    ) : (
      <>
        {!ranking && (
          <>
            <Btn tone="leaf" className="border-2 border-gold-400/70" onClick={() => act({ type: "MARK_CORRECT", team: "A" })}>
              <Check className="h-5 w-5" /> صح لـ {state.teams.A.name}
            </Btn>
            <Btn tone="leaf" className="border-2 border-volt-400/70" onClick={() => act({ type: "MARK_CORRECT", team: "B" })}>
              <Check className="h-5 w-5" /> صح لـ {state.teams.B.name}
            </Btn>
            {(a.stage === "answering" || a.stage === "stealing") && (
              <Btn tone="wine" onClick={() => act({ type: "MARK_WRONG" })}>
                <X className="h-5 w-5" /> خطأ
              </Btn>
            )}
            {a.stage === "answering" && !a.noSteal && (
              <Btn tone="volt" onClick={() => act({ type: "TRANSFER" })}>
                <ArrowRight className="h-5 w-5" /> تحويل لـ {state.teams[other].name}
              </Btn>
            )}
          </>
        )}
        {ranking && <span className="px-2 text-sm text-white/60">سؤال ترتيب — سجّل النقاط من لوحة المضيف</span>}
        <Btn onClick={() => act({ type: "REVEAL_ANSWER" })}>
          <Eye className="h-5 w-5" /> إظهار الإجابة
        </Btn>
        <Btn onClick={() => act({ type: "SKIP" })}>
          <SkipForward className="h-5 w-5" /> تخطي
        </Btn>
        {state.timer.label &&
          (state.timer.running ? (
            <Btn onClick={() => act({ type: "PAUSE" })} label="إيقاف مؤقت">
              <Pause className="h-5 w-5" />
            </Btn>
          ) : (
            <Btn onClick={() => act({ type: "RESUME" })} label="استئناف" disabled={state.timer.expired}>
              <Play className="h-5 w-5" />
            </Btn>
          ))}
        {state.timer.label && (
          <Btn onClick={() => act({ type: "ADD_TIME", seconds: 15 })} label="+15 ثانية">
            <Plus className="h-5 w-5" /> 15
          </Btn>
        )}
      </>
    );
  } else if (state.phase === "final_question" && f) {
    buttons = (
      <>
        {(["A", "B"] as TeamId[]).map((t) => (
          <span key={t} className="flex items-center gap-1 rounded-2xl bg-white/[0.05] p-1">
            <span className={cn("px-2 text-sm font-bold", TEAM_COLORS[t].text)}>{state.teams[t].name}</span>
            <Btn tone="leaf" onClick={() => act({ type: "FINAL_JUDGE", team: t, correct: true })}>
              صح
            </Btn>
            <Btn tone="wine" onClick={() => act({ type: "FINAL_JUDGE", team: t, correct: false })}>
              خطأ
            </Btn>
          </span>
        ))}
        <Btn disabled={f.revealed} onClick={() => act({ type: "FINAL_REVEAL" })}>
          <Eye className="h-5 w-5" /> إظهار الإجابة
        </Btn>
        <Btn tone="gold" disabled={f.results.A === null || f.results.B === null} onClick={() => act({ type: "FINISH" })}>
          🏆 النتيجة النهائية
        </Btn>
      </>
    );
  } else if (state.phase === "final_wager") {
    buttons = <span className="px-2 text-sm text-white/60">سجّل رهانات الفريقين من لوحة المضيف 👑</span>;
  }

  if (!buttons && state.phase !== "board") return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col items-center px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-t-xl bg-night-950/90 px-3 py-1 text-xs text-white/60 backdrop-blur hover:text-white"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        {open ? "إخفاء التحكم" : "إظهار التحكم"}
      </button>
      {open && (
        <div className="flex w-full max-w-5xl flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-night-950/90 p-2 shadow-2xl backdrop-blur">
          {state.phase === "board" ? (
            <span className="px-2 text-sm text-white/60">🖱️ اضغط على أي خانة في اللوحة لفتح السؤال</span>
          ) : (
            buttons
          )}
          {host.error && <span className="w-full text-center text-sm text-wine-400">{host.error}</span>}
          <Link href={`/game/${state.sessionId}/host`} target="_blank" className="rounded-xl px-3 py-2 text-xs text-white/45 hover:text-white">
            لوحة المضيف ↗
          </Link>
        </div>
      )}
    </div>
  );
}

const TONES = {
  soft: "bg-white/[0.08] text-white hover:bg-white/[0.15]",
  gold: "bg-gradient-to-b from-gold-300 to-gold-500 text-night-950",
  leaf: "bg-gradient-to-b from-leaf-400 to-leaf-600 text-white",
  wine: "bg-gradient-to-b from-wine-400 to-wine-600 text-white",
  volt: "bg-gradient-to-b from-volt-400 to-volt-600 text-white",
};

function Btn({
  children,
  onClick,
  tone = "soft",
  disabled,
  label,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: keyof typeof TONES;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn("inline-flex h-11 items-center gap-1.5 rounded-xl px-4 font-bold transition active:scale-95 disabled:opacity-30", TONES[tone], className)}
    >
      {children}
    </button>
  );
}
