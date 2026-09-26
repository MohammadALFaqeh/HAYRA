"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Maximize, Minimize } from "lucide-react";
import { useClockSync } from "@/lib/client/clock";
import { unlockAudio } from "@/lib/client/sound";
import { useHostSession } from "@/lib/client/use-host-session";
import { usePublicSession } from "@/lib/client/use-public-session";
import { toPublicState } from "@/lib/game/public";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { Spinner } from "@/components/ui";
import { Board } from "./Board";
import { EventOverlay } from "./EventOverlay";
import { FinalStage } from "./FinalStage";
import { PrepStage } from "./PrepStage";
import { QuestionStage } from "./QuestionStage";
import { ResultsView } from "./ResultsView";
import { Scoreboard } from "./Scoreboard";
import { SecondsStage } from "./SecondsStage";
import { TvHostControls } from "./TvHostControls";

/** شاشة التلفزيون + وضع المتفرج. على جهاز المضيف تصبح تفاعلية (فتح الخانات والتحكيم) */
export function TvView({ sessionId, spectator = false }: { sessionId: string; spectator?: boolean }) {
  useClockSync();
  const { state: live, status } = usePublicSession(sessionId);
  // جهاز المضيف (يحمل مفتاح الجلسة) يتحكم من الشاشة مباشرة
  const host = useHostSession(sessionId);
  const canControl = host.status === "ready" && !!host.state;
  const { syncWith } = host;
  useEffect(() => syncWith(live?.updatedAt), [live?.updatedAt, syncWith]);
  // على جهاز المضيف نعرض الحالة المحلية فورًا بدل انتظار السيرفر (استجابة أسرع للأزرار)
  const hostState = host.state;
  const state = useMemo(() => (canControl && hostState ? toPublicState(hostState) : live), [canControl, hostState, live]);
  const [origin, setOrigin] = useState("");
  const [started, setStarted] = useState(spectator);
  const [full, setFull] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  if (status === "missing" || status === "closed") {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="space-y-5">
          <Logo size={220} />
          <h1 className="font-display text-4xl font-extrabold">{status === "closed" ? "انتهت اللعبة 👋 شكرًا للعب!" : "الجلسة غير موجودة"}</h1>
          {!spectator && (
            <Link href="/" className="inline-block rounded-2xl bg-gold-400 px-6 py-3 font-bold text-night-950">
              الرئيسية
            </Link>
          )}
        </div>
      </main>
    );
  }
  if (!state) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <Spinner label="جارٍ الاتصال باللعبة…" />
      </main>
    );
  }

  // تفعيل الصوت يحتاج لمسة واحدة على شاشة التلفزيون
  if (!started) {
    return (
      <button
        className="grid min-h-dvh w-full place-items-center p-6 text-center"
        onClick={() => {
          unlockAudio();
          setStarted(true);
          void document.documentElement.requestFullscreen?.().catch(() => undefined);
        }}
      >
        <div className="space-y-6">
          <Logo size={320} className="animate-float" />
          <div className="font-display text-4xl font-extrabold">
            {state.teams.A.name} <span className="text-white/40">ضد</span> {state.teams.B.name}
          </div>
          <div className="inline-block animate-pulse-ring rounded-3xl bg-gold-400 px-10 py-5 font-display text-3xl font-extrabold text-night-950">
            اضغط للبدء 🎬
          </div>
          <p className="text-white/50">سيتم تفعيل الصوت وملء الشاشة</p>
        </div>
      </button>
    );
  }

  const inQuestion = state.phase === "question" && state.active;
  const sound = !spectator;
  const usedCells = state.cells.filter((cell) => cell.status === "used").length;
  const playableCells = state.cells.filter((cell) => cell.status !== "empty").length;

  return (
    <main
      className={cn(
        "flex min-h-dvh flex-col gap-4 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4 lg:gap-6 lg:px-8",
        canControl && "pb-40 sm:pb-28",
      )}
    >
      <header className="flex items-center gap-4">
        <Logo size={spectator ? 70 : 110} glow={false} className="mx-0" />
        <div className="flex-1">
          <Scoreboard teams={state.teams} turn={state.turn} answering={state.active?.answeringTeam ?? state.seconds?.answeringTeam} size={spectator ? "md" : "lg"} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="live-mark self-end">{spectator ? "مباشر" : "حيرة الآن"}</span>
          {!spectator && <SoundToggle />}
          {!spectator && (
            <button
              className="rounded-full bg-white/[0.07] p-2.5 text-white/80 hover:bg-white/15"
              onClick={() => (full ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
              aria-label="ملء الشاشة"
            >
              {full ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </button>
          )}
        </div>
      </header>

      <section className="broadcast-frame panel flex-1 p-4 lg:p-8">
        {state.phase === "board" && (
          <div className="flex h-full flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-center font-display text-2xl font-bold text-white/80 lg:text-3xl">
                🎯 دور <span className={state.turn === "A" ? "text-gold-300" : "text-volt-400"}>{state.teams[state.turn].name}</span> باختيار السؤال
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-bold tracking-wider text-white/45">الجولة الرئيسية · {usedCells}/{playableCells}</span>
            </div>
            <Board
              columns={state.columns}
              cells={state.cells}
              onPick={canControl ? (cell) => cell.status === "available" && void host.dispatch({ type: "OPEN_CELL", cellKey: cell.key }) : undefined}
            />
          </div>
        )}
        {inQuestion && state.active!.stage === "prep" && <PrepStage state={state} />}
        {inQuestion && state.active!.stage !== "prep" && <QuestionStage active={state.active!} teams={state.teams} timer={state.timer} origin={origin} sound={sound} />}
        {state.phase === "seconds" && state.seconds && <SecondsStage round={state.seconds} teams={state.teams} sound={sound} />}
        {(state.phase === "final_wager" || state.phase === "final_question") && <FinalStage state={state} origin={origin} sound={sound} />}
        {state.phase === "finished" && (
          <div className="grid h-full place-items-center">
            <ResultsView teams={state.teams} big={!spectator} />
          </div>
        )}
      </section>

      {spectator && (
        <footer className="text-center text-sm text-white/40">👀 وضع المتفرج — للمشاهدة فقط {status === "polling" && "(تحديث دوري)"}</footer>
      )}
      <EventOverlay event={state.lastEvent} teams={state.teams} sound={sound} />
      {canControl && <TvHostControls host={host} state={state} />}
    </main>
  );
}
