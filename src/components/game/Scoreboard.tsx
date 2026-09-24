"use client";
import { motion } from "framer-motion";
import type { TeamId, TeamState } from "@/lib/game/types";
import { cn, formatPoints, TEAM_COLORS } from "@/lib/utils";

export function Scoreboard({
  teams,
  turn,
  answering,
  size = "md",
  onTeamClick,
}: {
  teams: Record<TeamId, TeamState>;
  turn: TeamId;
  answering?: TeamId | null;
  size?: "sm" | "md" | "lg";
  onTeamClick?: (t: TeamId) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {(["A", "B"] as TeamId[]).map((id) => (
        <TeamCard
          key={id}
          team={teams[id]}
          active={(answering ?? turn) === id}
          size={size}
          onClick={onTeamClick ? () => onTeamClick(id) : undefined}
        />
      ))}
    </div>
  );
}

function TeamCard({ team, active, size, onClick }: { team: TeamState; active: boolean; size: "sm" | "md" | "lg"; onClick?: () => void }) {
  const c = TEAM_COLORS[team.id];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-[1.4rem] border bg-night-900/80 text-right transition",
        active ? (team.id === "A" ? "border-gold-400/70 shadow-gold" : "border-volt-400/70 shadow-volt") : "border-white/[0.07] opacity-80",
        size === "sm" ? "px-3 py-2" : size === "md" ? "px-4 py-3" : "px-6 py-4",
      )}
    >
      <span className={cn("absolute inset-y-0 right-0 w-1.5", c.bg, !active && "opacity-40")} />
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className={cn("truncate font-display font-bold", size === "lg" ? "text-2xl" : size === "md" ? "text-lg" : "text-sm")}>
            {team.name}
          </div>
          {team.streak >= 2 && <div className="text-xs text-ember-400">🔥 {team.streak} متتالية</div>}
        </div>
        <motion.div
          key={team.score}
          initial={{ scale: 1.35 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 14 }}
          className={cn(
            "font-display font-extrabold tabular-nums",
            c.text,
            size === "lg" ? "text-5xl" : size === "md" ? "text-3xl" : "text-xl",
          )}
        >
          {formatPoints(team.score)}
        </motion.div>
      </div>
    </Tag>
  );
}
