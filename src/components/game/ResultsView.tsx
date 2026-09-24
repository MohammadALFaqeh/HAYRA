"use client";
import { useMemo, type ReactNode } from "react";
import { motion } from "framer-motion";
import type { TeamId, TeamState } from "@/lib/game/types";
import { computeStats } from "@/lib/game/stats";
import { WINNER_LINES } from "@/lib/game/comments";
import { cn, formatPoints, TEAM_COLORS } from "@/lib/utils";

export function ResultsView({ teams, actions, big }: { teams: Record<TeamId, TeamState>; actions?: ReactNode; big?: boolean }) {
  const stats = useMemo(() => computeStats(teams), [teams]);
  const line = useMemo(() => WINNER_LINES[(teams.A.score + teams.B.score) % WINNER_LINES.length], [teams]);
  const w = stats.winner;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-8 text-center">
      <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 180, damping: 12 }}>
        <div className={big ? "text-9xl" : "text-7xl"}>{w ? "🏆" : "🤝"}</div>
        {w ? (
          <>
            <div className={cn("mt-2 break-words font-display font-extrabold", big ? "text-5xl sm:text-7xl" : "text-4xl sm:text-5xl", TEAM_COLORS[w].text)}>{teams[w].name}</div>
            <div className={cn("mt-2 text-white/75", big ? "text-3xl" : "text-xl")}>{line}</div>
          </>
        ) : (
          <div className={cn("mt-2 font-display text-4xl font-extrabold sm:text-5xl", big && "sm:text-7xl")}>تعادل! الحيرة مستمرة 😅</div>
        )}
      </motion.div>

      <div className="grid w-full grid-cols-2 gap-4">
        {(["A", "B"] as TeamId[]).map((id) => (
          <div
            key={id}
            className={cn(
              "rounded-[1.5rem] border-2 bg-night-900/80 p-4 sm:rounded-[2rem] sm:p-5",
              w === id ? (id === "A" ? "border-gold-400 shadow-gold" : "border-volt-400 shadow-volt") : "border-white/10",
            )}
          >
            <div className="break-words font-display text-xl font-bold sm:text-2xl">{teams[id].name}</div>
            <div className={cn("font-display font-extrabold tabular-nums", big ? "text-5xl sm:text-7xl" : "text-4xl sm:text-5xl", TEAM_COLORS[id].text)}>
              {formatPoints(teams[id].score)}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 sm:text-sm">
              <Stat label="صح" value={teams[id].stats.correct} />
              <Stat label="سرقات" value={teams[id].stats.steals} />
              <Stat label="أطول سلسلة" value={teams[id].stats.maxStreak} />
              <Stat label="خطأ" value={teams[id].stats.wrong} />
              <Stat label="مساعدات" value={stats.powerupsUsed[id]} />
              <Stat label="أفضل فئة" value={stats.bestCategory[id]?.name ?? "—"} />
            </dl>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-3 text-lg">
        {stats.fastest && (
          <span className="rounded-full bg-white/[0.06] px-4 py-2">
            ⚡ أسرع إجابة: {teams[stats.fastest.team].name} ({(stats.fastest.ms / 1000).toFixed(1)} ث)
          </span>
        )}
        {stats.topStreak && (
          <span className="rounded-full bg-white/[0.06] px-4 py-2">
            🔥 أطول سلسلة: {teams[stats.topStreak.team].name} ({stats.topStreak.count})
          </span>
        )}
      </div>
      {actions}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-white/[0.04] px-2 py-2">
      <dt className="text-white/50">{label}</dt>
      <dd className="truncate font-bold">{value}</dd>
    </div>
  );
}
