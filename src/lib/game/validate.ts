import { POWERUP_IDS } from "./constants";
import type { GameAction, PowerupId } from "./types";

const isTeam = (t: unknown): t is "A" | "B" => t === "A" || t === "B";
const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const isKey = (k: unknown): k is string => typeof k === "string" && /^c\d{1,2}-r\d$/.test(k);

/** يتحقق من شكل الإجراء القادم من المتصفح قبل تمريره للمحرك */
export function parseAction(raw: unknown): GameAction | { type: "UNDO" } | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  switch (a.type) {
    case "UNDO":
    case "MARK_WRONG":
    case "TRANSFER":
    case "REVEAL_ANSWER":
    case "BACK_TO_BOARD":
    case "SKIP":
    case "RESTART_QUESTION":
    case "PAUSE":
    case "RESUME":
    case "TIME_UP":
    case "NEXT_CLUE":
    case "PLAY_MEDIA":
    case "END_BOARD":
    case "FINAL_START":
    case "FINAL_REVEAL":
    case "FINISH_RANKING":
    case "FINISH":
    case "SECONDS_TRANSFER":
    case "SECONDS_REVEAL":
    case "SECONDS_CLOSE":
      return { type: a.type } as GameAction;
    case "START_QUESTION":
      return { type: "START_QUESTION" };
    case "OPEN_CELL":
    case "REOPEN_CELL":
      return isKey(a.cellKey) ? ({ type: a.type, cellKey: a.cellKey } as GameAction) : null;
    case "MARK_CORRECT":
    case "SET_TURN":
      return isTeam(a.team) ? ({ type: a.type, team: a.team } as GameAction) : null;
    case "MARK_RANK":
      return isTeam(a.team) && isNum(a.rank) && Number.isInteger(a.rank) && a.rank >= 0 && a.rank <= 20
        ? { type: "MARK_RANK", team: a.team, rank: a.rank }
        : null;
    case "ADD_TIME":
      return isNum(a.seconds) ? { type: "ADD_TIME", seconds: a.seconds } : null;
    case "ADJUST_SCORE":
      return isTeam(a.team) && isNum(a.delta) && Math.abs(a.delta) <= 100000 ? { type: "ADJUST_SCORE", team: a.team, delta: a.delta } : null;
    case "SET_SCORE":
      return isTeam(a.team) && isNum(a.score) && Math.abs(a.score) <= 1000000 ? { type: "SET_SCORE", team: a.team, score: a.score } : null;
    case "USE_POWERUP":
      return isTeam(a.team) && POWERUP_IDS.includes(a.powerup as PowerupId)
        ? { type: "USE_POWERUP", team: a.team, powerup: a.powerup as PowerupId }
        : null;
    case "FINAL_SET_WAGER":
      return isTeam(a.team) && isNum(a.amount) ? { type: "FINAL_SET_WAGER", team: a.team, amount: a.amount } : null;
    case "FINAL_JUDGE":
      return isTeam(a.team) && typeof a.correct === "boolean" ? { type: "FINAL_JUDGE", team: a.team, correct: a.correct } : null;
    case "SECONDS_OPEN":
      return isTeam(a.team) && (a.level === 1 || a.level === 2 || a.level === 3) && isNum(a.points)
        ? { type: "SECONDS_OPEN", team: a.team, level: a.level, points: a.points }
        : null;
    case "SECONDS_START":
      return isNum(a.targetMs) ? { type: "SECONDS_START", targetMs: a.targetMs } : null;
    case "SECONDS_GUESS":
      return isNum(a.guessMs) ? { type: "SECONDS_GUESS", guessMs: a.guessMs } : null;
    default:
      return null;
  }
}
