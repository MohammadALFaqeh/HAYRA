// ============================================================
// حيرة — أنواع حالة اللعبة (مشتركة بين السيرفر والمتصفح)
// ============================================================

export type TeamId = "A" | "B";
export type Level = "family" | "medium" | "pro";
export type PowerupId = "double" | "extra_time" | "no_steal" | "fifty_fifty";
export type MysteryKind = "bonus" | "double" | "golden" | "challenge";
export type QuestionType =
  | "text"
  | "multiple_choice"
  | "reverse_points"
  | "individual"
  | "image"
  | "audio"
  | "video"
  | "logo"
  | "identify_image"
  | "who_am_i"
  | "qr_acting"
  | "qr_drawing"
  | "qr_describe"
  | "qr_secret"
  | "qr_who_am_i"
  | "qr_sound"
  | "qr_movement";

export type Phase = "board" | "question" | "seconds" | "final_wager" | "final_question" | "finished" | "closed";

/** مرحلة السؤال المفتوح */
export type Stage =
  | "prep" // قبل عرض السؤال: اختيار وسائل المساعدة (اختياري)
  | "answering" // الفريق صاحب الدور يجيب
  | "stealing" // فرصة السرقة للفريق الآخر
  | "failed" // لم يعرف أحد — بانتظار إظهار الإجابة
  | "revealed" // ظهرت الإجابة
  | "resolved"; // تمت الإجابة الصحيحة واحتُسبت النقاط

export interface GameSettings {
  level: Level;
  questionSeconds: number;
  stealSeconds: number;
  finalSeconds: number;
  familyMode: boolean;
  verifiedOnly: boolean;
  powerupsEnabled: boolean;
  enabledPowerups: PowerupId[];
  streakEnabled: boolean;
  streakThreshold: number;
  streakBonus: number;
  mysteryEnabled: boolean;
  mysteryCount: number;
  finalEnabled: boolean;
}

export interface TeamStats {
  correct: number;
  wrong: number;
  steals: number;
  fastestMs: number | null;
  maxStreak: number;
  byCategory: Record<string, number>;
  streakBonuses: number;
}

export interface TeamState {
  id: TeamId;
  name: string;
  score: number;
  streak: number;
  powerups: Record<PowerupId, "available" | "used" | "disabled">;
  stats: TeamStats;
}

export interface BoardColumn {
  key: string; // c0, c1 ...
  categoryId: string;
  subcategoryId: string | null;
  title: string;
  subtitle: string | null;
  icon: string;
  color: string;
}

export interface BoardCell {
  key: string; // c0-r0
  col: number;
  row: number;
  points: number;
  questionId: string | null;
  status: "available" | "used" | "empty";
  mystery: MysteryKind | null; // سري — لا يُرسل للتلفزيون قبل الفتح
  mysteryRevealed: boolean;
  wonBy: TeamId | null;
}

export interface QuestionSnapshot {
  id: string;
  type: QuestionType;
  text: string;
  answer: string;
  choices: string[] | null;
  clues: string[] | null;
  extra: {
    instructions?: string;
    forbidden?: string[];
    quote?: string;
    answer_is_quote?: boolean;
    hint?: string;
    target?: string;
    rank_limit?: number;
  };
  imageUrl: string | null;
  audioUrl: string | null;
  videoUrl: string | null;
  explanation: string | null;
  source: string | null;
  reference: string | null;
  verified: boolean;
  difficulty: number;
  categoryTitle: string;
  subcategoryName: string | null;
}

export interface ActiveQuestion {
  cellKey: string | "final";
  questionId: string;
  pickedBy: TeamId;
  answeringTeam: TeamId;
  stage: Stage;
  basePoints: number;
  multiplier: number;
  doubleFor: TeamId | null;
  noSteal: boolean;
  mystery: MysteryKind | null;
  removedChoices: number[];
  cluesShown: number;
  openedAt: number;
  stageStartedAt: number;
  qrToken: string | null;
  mediaCue: number;
  powerupsUsed: { team: TeamId; powerup: PowerupId }[];
  winner: TeamId | null;
  awarded: number;
  rankClaims: Record<TeamId, number[]>;
}

export interface TimerState {
  running: boolean;
  endsAt: number | null; // epoch ms (توقيت السيرفر)
  remainingMs: number; // عند الإيقاف المؤقت
  durationMs: number;
  label: "answer" | "steal" | "final" | null;
  expired: boolean;
}

export interface FinalState {
  questionId: string | null;
  wagers: Record<TeamId, number | null>;
  results: Record<TeamId, boolean | null>;
  applied: Record<TeamId, number>;
  revealed: boolean;
}

export type EventKind =
  | "open"
  | "correct"
  | "steal_correct"
  | "wrong"
  | "transfer"
  | "reveal"
  | "timeup"
  | "powerup"
  | "streak"
  | "mystery"
  | "skip"
  | "score"
  | "final_wager"
  | "final_result"
  | "finish"
  | "undo";

export interface LastEvent {
  id: number;
  kind: EventKind;
  team: TeamId | null;
  points: number;
  comment: string | null;
  meta?: Record<string, string | number | boolean | null>;
  at: number;
}

// ------------------------------------------------------------
// فقرة «ملك الثواني»: عداد يظهر لحظة ثم يختفي، والفريق يقدّر المدة
// ------------------------------------------------------------
export type SecondsLevel = 1 | 2 | 3;

export interface SecondsGuess {
  team: TeamId;
  guessMs: number;
  diffMs: number; // التخمين − الوقت الحقيقي
  correct: boolean;
}

export interface SecondsRound {
  pickedBy: TeamId;
  answeringTeam: TeamId;
  level: SecondsLevel;
  points: number;
  /**
   * ready: شرح الفقرة على الشاشة · running: العد جارٍ ثم انتظار التخمين
   * missed: أخطأ الفريق الأول · done: ظهرت النتيجة
   */
  stage: "ready" | "running" | "missed" | "done";
  targetMs: number | null; // المدة الحقيقية (سرية حتى النتيجة)
  startsAt: number | null; // لحظة بدء العد بعد العد التنازلي 3-2-1
  guesses: SecondsGuess[];
  winner: TeamId | null;
}

export interface GameState {
  v: 1;
  sessionId: string;
  phase: Phase;
  teams: Record<TeamId, TeamState>;
  turn: TeamId;
  settings: GameSettings;
  columns: BoardColumn[];
  cells: BoardCell[];
  questions: Record<string, QuestionSnapshot>;
  active: ActiveQuestion | null;
  timer: TimerState;
  final: FinalState | null;
  /** اختياري لتوافق الجلسات المحفوظة قبل إضافة الفقرة */
  seconds?: SecondsRound | null;
  lastEvent: LastEvent | null;
  eventSeq: number;
  packName: string | null;
  createdAt: number;
  updatedAt: number;
}

// ------------------------------------------------------------
// الإجراءات التي يرسلها المضيف
// ------------------------------------------------------------
export type GameAction =
  | { type: "OPEN_CELL"; cellKey: string }
  | { type: "START_QUESTION" }
  | { type: "MARK_CORRECT"; team: TeamId }
  | { type: "MARK_RANK"; team: TeamId; rank: number }
  | { type: "FINISH_RANKING" }
  | { type: "MARK_WRONG" }
  | { type: "TRANSFER" }
  | { type: "REVEAL_ANSWER" }
  | { type: "BACK_TO_BOARD" }
  | { type: "SKIP" }
  | { type: "RESTART_QUESTION" }
  | { type: "REOPEN_CELL"; cellKey: string }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "ADD_TIME"; seconds: number }
  | { type: "TIME_UP" }
  | { type: "ADJUST_SCORE"; team: TeamId; delta: number }
  | { type: "SET_SCORE"; team: TeamId; score: number }
  | { type: "SET_TURN"; team: TeamId }
  | { type: "USE_POWERUP"; team: TeamId; powerup: PowerupId }
  | { type: "NEXT_CLUE" }
  | { type: "PLAY_MEDIA" }
  | { type: "END_BOARD" }
  | { type: "FINAL_SET_WAGER"; team: TeamId; amount: number }
  | { type: "FINAL_START" }
  | { type: "FINAL_JUDGE"; team: TeamId; correct: boolean }
  | { type: "FINAL_REVEAL" }
  | { type: "FINISH" }
  | { type: "SECONDS_OPEN"; team: TeamId; level: SecondsLevel; points: number }
  | { type: "SECONDS_START"; targetMs: number }
  | { type: "SECONDS_GUESS"; guessMs: number }
  | { type: "SECONDS_TRANSFER" }
  | { type: "SECONDS_REVEAL" }
  | { type: "SECONDS_CLOSE" };

/** سياق خارجي يُمرر للمحرك (الوقت + العشوائية + رمز QR من السيرفر) */
export interface EngineContext {
  now: number;
  random: () => number;
  newQrToken?: () => string;
}

export class GameRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameRuleError";
  }
}
