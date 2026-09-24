"use client";
import { motion } from "framer-motion";
import type { PublicState } from "@/lib/game/public";
import { MYSTERY, POWERUPS } from "@/lib/game/constants";
import { cn, formatPoints, TEAM_COLORS } from "@/lib/utils";

/** قبل عرض السؤال: الفئة والقيمة والفريق، ووقت اختيار وسائل المساعدة (اختياري) */
export function PrepStage({ state }: { state: PublicState }) {
  const a = state.active!;
  const team = state.teams[a.pickedBy];
  const tc = TEAM_COLORS[a.pickedBy];
  const cell = state.cells.find((c) => c.key === a.cellKey);
  const col = cell ? state.columns[cell.col] : null;
  const points = a.basePoints * a.multiplier * (a.doubleFor === a.pickedBy ? 2 : 1);
  const available = state.settings.enabledPowerups.filter((p) => team.powerups[p] === "available");

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="question-stage flex h-full flex-col items-center justify-center gap-6 rounded-[1.75rem] p-6 text-center"
    >
      {col && (
        <div className="font-display text-2xl font-bold text-white/80 lg:text-4xl">
          {col.icon} {col.title}
        </div>
      )}
      <div className="gold-text font-display text-6xl font-extrabold lg:text-8xl">{formatPoints(points)}</div>
      {a.mystery && (
        <div className="rounded-full bg-violet-500/25 px-5 py-2 text-xl font-bold text-violet-400 lg:text-2xl">
          {MYSTERY[a.mystery].icon} {MYSTERY[a.mystery].name}
        </div>
      )}
      <div className={cn("font-display text-3xl font-extrabold lg:text-5xl", tc.text)}>🎯 {team.name}</div>

      <div className="space-y-3">
        <div className="text-xl text-white/70 lg:text-2xl">⚡ بدكم تستخدموا وسيلة مساعدة قبل السؤال؟</div>
        <div className="flex flex-wrap justify-center gap-2">
          {available.map((p) => (
            <span key={p} className="rounded-2xl bg-white/[0.07] px-4 py-2 text-lg font-bold lg:text-xl">
              {POWERUPS[p].icon} {POWERUPS[p].name}
            </span>
          ))}
        </div>
        {a.powerupsUsed.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {a.powerupsUsed.map((u, i) => (
              <span key={i} className="rounded-full bg-leaf-500/20 px-3 py-1 text-base font-bold text-leaf-400">
                ✓ {POWERUPS[u.powerup].icon} {POWERUPS[u.powerup].name}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
