// ============================================================
// حيرة — النسخة العامة من الحالة (للتلفزيون والجمهور)
// لا تحتوي الإجابة إلا بعد السماح بعرضها، ولا تكشف نوع الخانة الغامضة
// ============================================================
import type {
  ActiveQuestion,
  BoardColumn,
  GameSettings,
  GameState,
  LastEvent,
  MysteryKind,
  Phase,
  QuestionType,
  SecondsRound,
  TeamId,
  TeamState,
  TimerState,
} from "./types";

export interface PublicCell {
  key: string;
  col: number;
  row: number;
  points: number;
  status: "available" | "used" | "empty";
  mystery: boolean;
  mysteryKind: MysteryKind | null;
  wonBy: TeamId | null;
}

export interface PublicQuestion {
  id: string;
  type: QuestionType;
  text: string;
  quote: string | null;
  choices: string[] | null;
  removedChoices: number[];
  clues: string[];
  cluesTotal: number;
  imageUrl: string | null;
  audioUrl: string | null;
  videoUrl: string | null;
  categoryTitle: string;
  subcategoryName: string | null;
  target: string | null;
  answer: string | null;
  answerIsQuote: boolean;
  explanation: string | null;
}

export interface PublicActive
  extends Pick<
    ActiveQuestion,
    | "cellKey"
    | "pickedBy"
    | "answeringTeam"
    | "stage"
    | "basePoints"
    | "multiplier"
    | "doubleFor"
    | "noSteal"
    | "mystery"
    | "qrToken"
    | "mediaCue"
    | "powerupsUsed"
    | "winner"
    | "awarded"
  > {
  rankAttempts: Record<TeamId, number>;
  question: PublicQuestion | null;
}

export interface PublicFinal {
  locked: Record<TeamId, boolean>;
  wagers: Record<TeamId, number | null>; // تظهر بعد التحكيم فقط
  results: Record<TeamId, boolean | null>;
  revealed: boolean;
}

export interface PublicSeconds
  extends Pick<SecondsRound, "pickedBy" | "answeringTeam" | "level" | "points" | "stage" | "startsAt" | "winner"> {
  /** لحظة توقف العداد — يحتاجها التلفزيون ليتوقف بدقة دون انتظار الشبكة */
  stopsAt: number | null;
  /** الوقت الحقيقي يظهر فقط بعد النتيجة */
  targetMs: number | null;
  guesses: { team: TeamId; guessMs: number; correct: boolean; diffMs: number | null }[];
}

export interface PublicState {
  v: 1;
  sessionId: string;
  phase: Phase;
  teams: Record<TeamId, TeamState>;
  turn: TeamId;
  settings: Pick<GameSettings, "level" | "questionSeconds" | "stealSeconds" | "powerupsEnabled" | "enabledPowerups" | "streakEnabled" | "finalEnabled" | "familyMode">;
  columns: BoardColumn[];
  cells: PublicCell[];
  active: PublicActive | null;
  timer: TimerState;
  final: PublicFinal | null;
  seconds: PublicSeconds | null;
  lastEvent: LastEvent | null;
  packName: string | null;
  updatedAt: number;
  serverTime: number;
}

export function toPublicState(s: GameState, serverTime = Date.now()): PublicState {
  const a = s.active;
  let active: PublicActive | null = null;
  if (a) {
    const q = s.questions[a.questionId];
    const answerVisible =
      a.cellKey === "final" ? !!s.final?.revealed : a.stage === "resolved" || a.stage === "revealed";
    active = {
      cellKey: a.cellKey,
      pickedBy: a.pickedBy,
      answeringTeam: a.answeringTeam,
      stage: a.stage,
      basePoints: a.basePoints,
      multiplier: a.multiplier,
      doubleFor: a.doubleFor,
      noSteal: a.noSteal,
      mystery: a.mystery,
      qrToken: a.qrToken,
      mediaCue: a.mediaCue,
      powerupsUsed: a.powerupsUsed,
      winner: a.winner,
      awarded: a.awarded,
      rankAttempts: { A: a.rankClaims.A.length, B: a.rankClaims.B.length },
      // في مرحلة وسائل المساعدة يبقى السؤال مخفيًا عن الشاشة
      question: q && a.stage !== "prep"
        ? {
            id: q.id,
            type: q.type,
            text: q.text,
            quote: q.extra?.quote ?? null,
            choices: q.choices,
            removedChoices: a.removedChoices,
            clues: (q.clues ?? []).slice(0, a.cluesShown),
            cluesTotal: q.clues?.length ?? 0,
            imageUrl: q.imageUrl,
            audioUrl: q.audioUrl,
            videoUrl: q.videoUrl,
            categoryTitle: q.categoryTitle,
            subcategoryName: q.subcategoryName,
            target: q.extra?.target ?? null,
            answer: answerVisible ? q.answer : null,
            answerIsQuote: !!q.extra?.answer_is_quote,
            explanation: answerVisible ? q.explanation : null,
          }
        : null,
    };
  }

  let final: PublicFinal | null = null;
  if (s.final) {
    final = {
      locked: { A: s.final.wagers.A !== null, B: s.final.wagers.B !== null },
      wagers: {
        A: s.final.results.A !== null || s.phase === "finished" ? s.final.wagers.A : null,
        B: s.final.results.B !== null || s.phase === "finished" ? s.final.wagers.B : null,
      },
      results: s.final.results,
      revealed: s.final.revealed,
    };
  }

  let seconds: PublicSeconds | null = null;
  const r = s.phase === "seconds" ? s.seconds : null;
  if (r) {
    const done = r.stage === "done";
    seconds = {
      pickedBy: r.pickedBy,
      answeringTeam: r.answeringTeam,
      level: r.level,
      points: r.points,
      stage: r.stage,
      startsAt: r.startsAt,
      winner: r.winner,
      stopsAt: r.startsAt !== null && r.targetMs !== null ? r.startsAt + r.targetMs : null,
      targetMs: done ? r.targetMs : null,
      guesses: r.guesses.map((g) => ({ team: g.team, guessMs: g.guessMs, correct: g.correct, diffMs: done ? g.diffMs : null })),
    };
  }

  return {
    v: 1,
    sessionId: s.sessionId,
    phase: s.phase,
    teams: s.teams,
    turn: s.turn,
    settings: {
      level: s.settings.level,
      questionSeconds: s.settings.questionSeconds,
      stealSeconds: s.settings.stealSeconds,
      powerupsEnabled: s.settings.powerupsEnabled,
      enabledPowerups: s.settings.enabledPowerups,
      streakEnabled: s.settings.streakEnabled,
      finalEnabled: s.settings.finalEnabled,
      familyMode: s.settings.familyMode,
    },
    columns: s.columns,
    cells: s.cells.map((c) => ({
      key: c.key,
      col: c.col,
      row: c.row,
      points: c.points,
      status: c.status,
      // الخانة الغامضة مفاجأة: لا تظهر على اللوحة قبل فتحها
      mystery: !!c.mystery && c.mysteryRevealed,
      mysteryKind: c.mysteryRevealed ? c.mystery : null,
      wonBy: c.wonBy,
    })),
    active,
    timer: s.timer,
    final,
    seconds,
    lastEvent: s.lastEvent,
    packName: s.packName,
    updatedAt: s.updatedAt,
    serverTime,
  };
}
