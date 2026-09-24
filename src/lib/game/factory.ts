import { POWERUP_IDS } from "./constants";
import type {
  BoardCell,
  BoardColumn,
  GameSettings,
  GameState,
  QuestionSnapshot,
  TeamId,
  TeamState,
} from "./types";

export function newTeam(id: TeamId, name: string, settings: GameSettings): TeamState {
  const powerups = Object.fromEntries(
    POWERUP_IDS.map((p) => [p, settings.powerupsEnabled && settings.enabledPowerups.includes(p) ? "available" : "disabled"]),
  ) as TeamState["powerups"];
  return {
    id,
    name,
    score: 0,
    streak: 0,
    powerups,
    stats: { correct: 0, wrong: 0, steals: 0, fastestMs: null, maxStreak: 0, byCategory: {}, streakBonuses: 0 },
  };
}

export function createInitialState(input: {
  sessionId: string;
  teamNames: [string, string];
  settings: GameSettings;
  columns: BoardColumn[];
  cells: BoardCell[];
  questions: Record<string, QuestionSnapshot>;
  finalQuestionId: string | null;
  packName: string | null;
  now: number;
}): GameState {
  const { settings } = input;
  return {
    v: 1,
    sessionId: input.sessionId,
    phase: "board",
    teams: {
      A: newTeam("A", input.teamNames[0], settings),
      B: newTeam("B", input.teamNames[1], settings),
    },
    turn: "A",
    settings,
    columns: input.columns,
    cells: input.cells,
    questions: input.questions,
    active: null,
    timer: { running: false, endsAt: null, remainingMs: 0, durationMs: 0, label: null, expired: false },
    final:
      settings.finalEnabled && input.finalQuestionId
        ? {
            questionId: input.finalQuestionId,
            wagers: { A: null, B: null },
            results: { A: null, B: null },
            applied: { A: 0, B: 0 },
            revealed: false,
          }
        : null,
    lastEvent: null,
    eventSeq: 0,
    packName: input.packName,
    createdAt: input.now,
    updatedAt: input.now,
  };
}
