import type { TeamId, TeamState } from "./types";

export interface GameStats {
  winner: TeamId | null;
  fastest: { team: TeamId; ms: number } | null;
  topStreak: { team: TeamId; count: number } | null;
  bestCategory: Record<TeamId, { name: string; count: number } | null>;
  powerupsUsed: Record<TeamId, number>;
}

/** إحصائيات نهاية اللعبة */
export function computeStats(teams: Record<TeamId, TeamState>): GameStats {
  const ids: TeamId[] = ["A", "B"];
  const a = teams.A.score;
  const b = teams.B.score;
  const winner: TeamId | null = a === b ? null : a > b ? "A" : "B";

  let fastest: GameStats["fastest"] = null;
  let topStreak: GameStats["topStreak"] = null;
  for (const id of ids) {
    const s = teams[id].stats;
    if (s.fastestMs !== null && (!fastest || s.fastestMs < fastest.ms)) fastest = { team: id, ms: s.fastestMs };
    if (s.maxStreak > 0 && (!topStreak || s.maxStreak > topStreak.count)) topStreak = { team: id, count: s.maxStreak };
  }
  const bestCategory = Object.fromEntries(
    ids.map((id) => {
      const entries = Object.entries(teams[id].stats.byCategory).sort((x, y) => y[1] - x[1]);
      return [id, entries[0] ? { name: entries[0][0], count: entries[0][1] } : null];
    }),
  ) as GameStats["bestCategory"];
  const powerupsUsed = Object.fromEntries(
    ids.map((id) => [id, Object.values(teams[id].powerups).filter((p) => p === "used").length]),
  ) as Record<TeamId, number>;
  return { winner, fastest, topStreak, bestCategory, powerupsUsed };
}
