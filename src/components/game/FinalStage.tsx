"use client";
import type { PublicState } from "@/lib/game/public";
import type { TeamId } from "@/lib/game/types";
import { cn, formatPoints, TEAM_COLORS } from "@/lib/utils";
import { QuestionStage } from "./QuestionStage";

/** مرحلة الرهان والسؤال النهائي على التلفزيون */
export function FinalStage({ state, origin, sound }: { state: PublicState; origin: string; sound?: boolean }) {
  const f = state.final;
  if (state.phase === "final_wager") {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-5 overflow-y-auto py-4 text-center sm:gap-10">
        <div>
          <div className="text-6xl sm:text-7xl">👑</div>
          <h2 className="gold-text mt-3 font-display text-4xl font-extrabold sm:text-6xl lg:text-7xl">السؤال النهائي</h2>
          <p className="mt-3 max-w-3xl text-base text-white/70 sm:mt-4 sm:text-2xl">كل فريق يراهن سرًّا بجزء من نقاطه أو كلها… صح = تربح الرهان، خطأ = تخسره!</p>
        </div>
        <div className="grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-6">
          {(["A", "B"] as TeamId[]).map((id) => (
            <div
              key={id}
              className={cn(
                "rounded-[1.5rem] border-2 p-4 sm:rounded-[2rem] sm:p-8",
                f?.locked[id] ? (id === "A" ? "border-gold-400 bg-gold-400/10" : "border-volt-400 bg-volt-500/10") : "border-white/10 bg-white/[0.03]",
              )}
            >
              <div className={cn("break-words font-display text-2xl font-bold sm:text-3xl", TEAM_COLORS[id].text)}>{state.teams[id].name}</div>
              <div className="mt-1 text-base text-white/60 sm:mt-2 sm:text-xl">الرصيد: {formatPoints(state.teams[id].score)}</div>
              <div className="mt-3 text-4xl sm:mt-6 sm:text-5xl">{f?.locked[id] ? "🔒" : "🤔"}</div>
              <div className="mt-2 text-lg">{f?.locked[id] ? "تم تثبيت الرهان" : "يفكرون بالرهان…"}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!state.active) return null;
  return (
    <div className="flex min-h-full flex-col gap-4 overflow-y-auto sm:gap-6">
      <QuestionStage active={state.active} teams={state.teams} timer={state.timer} origin={origin} sound={sound} isFinal />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
        {(["A", "B"] as TeamId[]).map((id) => {
          const r = f?.results[id];
          return (
            <div key={id} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 text-base sm:px-5 sm:text-xl">
              <span className={cn("font-display font-bold", TEAM_COLORS[id].text)}>{state.teams[id].name}</span>
              <span>
                {r === null || r === undefined ? "⏳" : r ? "✅" : "❌"}
                {f?.wagers[id] !== null && f?.wagers[id] !== undefined && <span className="ms-2 text-white/60">رهان {formatPoints(f.wagers[id]!)}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
