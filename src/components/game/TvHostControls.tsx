"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, ChevronUp, Eye, Pause, Play, Plus, SkipForward, X } from "lucide-react";
import { useCountdown, useSecondsClock } from "@/lib/client/clock";
import { play, unlockAudio } from "@/lib/client/sound";
import type { useHostSession } from "@/lib/client/use-host-session";
import type { PublicSeconds, PublicState } from "@/lib/game/public";
import { SECONDS_FLASH_MS, SECONDS_LEVELS, parseSecondsInput, randomSecondsTarget } from "@/lib/game/seconds";
import type { TeamId } from "@/lib/game/types";
import { POWERUPS } from "@/lib/game/constants";
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
    const other: TeamId = a.pickedBy === "A" ? "B" : "A";
    const ranking = a.question?.type === "reverse_points";
    const award = (
      <>
        <Btn tone="leaf" className="border-2 border-gold-400/70" onClick={() => act({ type: "MARK_CORRECT", team: "A" })}>
          <Check className="h-5 w-5" /> {state.teams.A.name}
        </Btn>
        <Btn tone="leaf" className="border-2 border-volt-400/70" onClick={() => act({ type: "MARK_CORRECT", team: "B" })}>
          <Check className="h-5 w-5" /> {state.teams.B.name}
        </Btn>
      </>
    );
    if (a.stage === "prep") {
      const team = state.teams[a.pickedBy];
      const used = new Set(a.powerupsUsed.map((u) => u.powerup));
      const options = state.settings.enabledPowerups.filter((p) => team.powerups[p] === "available" && !used.has(p));
      buttons = (
        <>
          <span className={cn("px-1 text-sm font-bold", TEAM_COLORS[a.pickedBy].text)}>⚡ {team.name}:</span>
          {options.map((p) => (
            <Btn key={p} onClick={() => act({ type: "USE_POWERUP", team: a.pickedBy, powerup: p })} label={POWERUPS[p].desc}>
              {POWERUPS[p].icon} {POWERUPS[p].name}
            </Btn>
          ))}
          <Btn tone="gold" onClick={() => act({ type: "START_QUESTION" })}>
            <Play className="h-5 w-5" /> {a.powerupsUsed.length ? "اعرض السؤال" : "تخطي واعرض السؤال"}
          </Btn>
        </>
      );
    } else if (a.stage === "resolved") {
      buttons = (
        <Btn tone="gold" onClick={() => act({ type: "BACK_TO_BOARD" })}>
          العودة للوحة ↩
        </Btn>
      );
    } else if (a.stage === "revealed" || a.stage === "failed") {
      // بعد إظهار الإجابة: لمين النقاط؟
      buttons = ranking ? (
        <Btn tone="gold" onClick={() => act({ type: "BACK_TO_BOARD" })}>
          العودة للوحة ↩
        </Btn>
      ) : (
        <>
          <span className="px-1 text-sm font-bold text-white/70">لمين النقاط؟</span>
          {award}
          <Btn tone="wine" onClick={() => act({ type: "BACK_TO_BOARD" })}>
            <X className="h-5 w-5" /> لا أحد
          </Btn>
        </>
      );
    } else {
      buttons = (
        <>
          <Btn tone="gold" onClick={() => act({ type: "REVEAL_ANSWER" })}>
            <Eye className="h-5 w-5" /> إظهار الإجابة
          </Btn>
          {!ranking && award}
          {!ranking && (
            <Btn tone="wine" onClick={() => act({ type: "MARK_WRONG" })}>
              <X className="h-5 w-5" /> خطأ
            </Btn>
          )}
          {!ranking && a.stage === "answering" && !a.noSteal && (
            <Btn tone="volt" onClick={() => act({ type: "TRANSFER" })}>
              <ArrowRight className="h-5 w-5" /> تحويل لـ {state.teams[other].name}
            </Btn>
          )}
          {ranking && <span className="px-2 text-sm text-white/60">سؤال ترتيب — سجّل النقاط من لوحة المضيف</span>}
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
    }
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
  } else if (state.phase === "seconds" && state.seconds) {
    buttons = <SecondsButtons round={state.seconds} state={state} act={act} />;
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
            <>
              <span className="px-2 text-sm text-white/60">🖱️ اضغط على أي خانة في اللوحة لفتح السؤال</span>
              <Btn onClick={() => act({ type: "SECONDS_OPEN", team: state.turn, level: 1, points: SECONDS_LEVELS[1].points })}>👑 ملك الثواني</Btn>
            </>
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

type Act = (a: Parameters<Host["dispatch"]>[0]) => void;

/** أزرار «ملك الثواني» على شاشة العرض — لا تكشف الوقت الحقيقي */
function SecondsButtons({ round: r, state, act }: { round: PublicSeconds; state: PublicState; act: Act }) {
  const clock = useSecondsClock(r.startsAt, r.stopsAt, SECONDS_FLASH_MS);
  const stopped = clock.phase === "stopped";
  const [guess, setGuess] = useState("");
  useEffect(() => setGuess(""), [r.answeringTeam, r.startsAt]);
  const guessMs = parseSecondsInput(guess);
  const otherTeam: TeamId = r.pickedBy === "A" ? "B" : "A";
  const start = () => act({ type: "SECONDS_START", targetMs: randomSecondsTarget(r.level) });

  if (r.stage === "ready") {
    return (
      <>
        {([1, 2, 3] as const).map((l) => (
          <Btn key={l} tone={r.level === l ? "gold" : "soft"} onClick={() => act({ type: "SECONDS_OPEN", team: r.pickedBy, level: l, points: SECONDS_LEVELS[l].points })}>
            {SECONDS_LEVELS[l].name}
          </Btn>
        ))}
        <Btn onClick={() => act({ type: "SECONDS_OPEN", team: otherTeam, level: r.level, points: r.points })}>
          🔁 الدور لـ {state.teams[otherTeam].name}
        </Btn>
        <Btn tone="gold" onClick={start}>
          <Play className="h-5 w-5" /> ابدأ العد
        </Btn>
        <Btn tone="wine" onClick={() => act({ type: "SECONDS_CLOSE" })}>
          <X className="h-5 w-5" /> إلغاء
        </Btn>
      </>
    );
  }
  if (r.stage === "running") {
    return (
      <>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (guessMs !== null && stopped) act({ type: "SECONDS_GUESS", guessMs });
          }}
        >
          <input
            inputMode="decimal"
            dir="ltr"
            placeholder={stopped ? `تخمين ${state.teams[r.answeringTeam].name}` : "انتظر التوقف…"}
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            disabled={!stopped}
            className="h-11 w-44 text-center tabular-nums"
          />
          <Btn tone="leaf" disabled={!stopped || guessMs === null} onClick={() => guessMs !== null && act({ type: "SECONDS_GUESS", guessMs })}>
            <Check className="h-5 w-5" /> احكم
          </Btn>
        </form>
        {r.guesses.length === 0 && (
          <Btn onClick={start} label="إعادة العد بمدة جديدة">
            🔁 إعادة العد
          </Btn>
        )}
        <Btn disabled={!stopped} onClick={() => act({ type: "SECONDS_REVEAL" })}>
          <Eye className="h-5 w-5" /> كشف النتيجة
        </Btn>
      </>
    );
  }
  if (r.stage === "missed") {
    return (
      <>
        <Btn tone="volt" onClick={() => act({ type: "SECONDS_TRANSFER" })}>
          <ArrowRight className="h-5 w-5" /> تحويل لـ {state.teams[otherTeam].name}
        </Btn>
        <Btn onClick={() => act({ type: "SECONDS_REVEAL" })}>
          <Eye className="h-5 w-5" /> كشف النتيجة
        </Btn>
      </>
    );
  }
  return (
    <>
      <Btn onClick={() => act({ type: "SECONDS_OPEN", team: otherTeam, level: r.level, points: SECONDS_LEVELS[r.level].points })}>
        🔁 جولة لـ {state.teams[otherTeam].name}
      </Btn>
      <Btn tone="gold" onClick={() => act({ type: "SECONDS_CLOSE" })}>
        العودة للوحة ↩
      </Btn>
    </>
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
      type="button"
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
