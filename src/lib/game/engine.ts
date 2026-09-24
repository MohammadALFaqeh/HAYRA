// ============================================================
// حيرة — محرك اللعبة (Reducer نقي)
// يعمل على السيرفر كمرجع نهائي، وعلى جهاز المضيف للتحديث الفوري/أوفلاين
// ============================================================
import { commentFor } from "./comments";
import { EXTRA_TIME_SECONDS, MYSTERY_BONUS_POINTS, isQrType } from "./constants";
import {
  GameRuleError,
  type ActiveQuestion,
  type EngineContext,
  type EventKind,
  type GameAction,
  type GameState,
  type LastEvent,
  type TeamId,
  type TimerState,
} from "./types";

export const otherTeam = (t: TeamId): TeamId => (t === "A" ? "B" : "A");

export function timerRemaining(timer: TimerState, now: number): number {
  if (!timer.running || timer.endsAt === null) return Math.max(0, timer.remainingMs);
  return Math.max(0, timer.endsAt - now);
}

function fail(msg: string): never {
  throw new GameRuleError(msg);
}

function startTimer(s: GameState, seconds: number, label: TimerState["label"], now: number) {
  const ms = Math.max(1, seconds) * 1000;
  s.timer = { running: true, endsAt: now + ms, remainingMs: ms, durationMs: ms, label, expired: false };
}

function stopTimer(s: GameState, now: number) {
  s.timer = { ...s.timer, remainingMs: timerRemaining(s.timer, now), running: false, endsAt: null };
}

function clearTimer(s: GameState) {
  s.timer = { running: false, endsAt: null, remainingMs: 0, durationMs: 0, label: null, expired: false };
}

function emit(
  s: GameState,
  ctx: EngineContext,
  kind: EventKind,
  team: TeamId | null,
  points = 0,
  comment: string | null = null,
  meta?: LastEvent["meta"],
) {
  s.eventSeq += 1;
  s.lastEvent = { id: s.eventSeq, kind, team, points, comment, meta, at: ctx.now };
}

function requireActive(s: GameState): ActiveQuestion {
  if (s.phase !== "question" || !s.active) fail("لا يوجد سؤال مفتوح");
  return s.active;
}

function requireStarted(a: ActiveQuestion) {
  if (a.stage === "prep") fail("ابدأ السؤال أولًا");
}

/** هل لدى الفريق وسيلة مساعدة متاحة؟ (لتحديد مرحلة ما قبل السؤال) */
function hasPowerups(s: GameState, team: TeamId) {
  return s.settings.powerupsEnabled && s.settings.enabledPowerups.some((p) => s.teams[team].powerups[p] === "available");
}

function columnTitleForCell(s: GameState, cellKey: string): string {
  const cell = s.cells.find((c) => c.key === cellKey);
  const col = cell ? s.columns[cell.col] : undefined;
  return col?.title ?? "أخرى";
}

function hasAvailableCells(s: GameState) {
  return s.cells.some((c) => c.status === "available" && c.questionId);
}

function enterEndOfBoard(s: GameState, ctx: EngineContext) {
  if (s.settings.finalEnabled && s.final?.questionId && s.questions[s.final.questionId]) {
    s.phase = "final_wager";
    s.final.wagers = { A: null, B: null };
    s.final.results = { A: null, B: null };
    s.final.applied = { A: 0, B: 0 };
    s.final.revealed = false;
    clearTimer(s);
  } else {
    finish(s, ctx);
  }
}

function finish(s: GameState, ctx: EngineContext) {
  s.phase = "finished";
  s.active = null;
  clearTimer(s);
  const a = s.teams.A.score;
  const b = s.teams.B.score;
  const winner: TeamId | null = a === b ? null : a > b ? "A" : "B";
  emit(s, ctx, "finish", winner, Math.max(a, b), null, { tie: winner === null });
}

function closeQuestion(s: GameState, ctx: EngineContext) {
  const a = requireActive(s);
  if (a.cellKey !== "final") {
    const cell = s.cells.find((c) => c.key === a.cellKey);
    if (cell) cell.status = "used";
  }
  s.turn = otherTeam(a.pickedBy);
  s.active = null;
  s.phase = "board";
  clearTimer(s);
  if (!hasAvailableCells(s)) enterEndOfBoard(s, ctx);
}

function award(s: GameState, team: TeamId, ctx: EngineContext) {
  const a = requireActive(s);
  const t = s.teams[team];
  const isSteal = team !== a.pickedBy;
  const points = a.basePoints * a.multiplier * (a.doubleFor === team ? 2 : 1);

  t.score += points;
  t.stats.correct += 1;
  if (isSteal) t.stats.steals += 1;
  const elapsed = ctx.now - a.stageStartedAt;
  if (elapsed > 0 && (t.stats.fastestMs === null || elapsed < t.stats.fastestMs)) t.stats.fastestMs = elapsed;
  const catTitle = columnTitleForCell(s, a.cellKey);
  t.stats.byCategory[catTitle] = (t.stats.byCategory[catTitle] ?? 0) + 1;

  t.streak += 1;
  t.stats.maxStreak = Math.max(t.stats.maxStreak, t.streak);
  let streakBonus = 0;
  if (s.settings.streakEnabled && t.streak >= s.settings.streakThreshold && t.streak % s.settings.streakThreshold === 0) {
    streakBonus = s.settings.streakBonus;
    t.score += streakBonus;
    t.stats.streakBonuses += 1;
  }

  a.winner = team;
  a.awarded = points;
  a.stage = "resolved";
  stopTimer(s, ctx.now);
  const cell = s.cells.find((c) => c.key === a.cellKey);
  if (cell) cell.wonBy = team;

  const comment = commentFor(isSteal ? "steal" : "correct", { team: t.name, points }, ctx.random);
  const streakLine =
    streakBonus > 0 ? commentFor("streak", { team: t.name, count: t.streak }, ctx.random) : null;
  emit(s, ctx, isSteal ? "steal_correct" : "correct", team, points, comment, {
    streak: t.streak,
    streakBonus,
    streakLine,
    elapsedMs: elapsed,
  });
}

function awardRank(s: GameState, team: TeamId, rank: number, ctx: EngineContext) {
  const a = requireActive(s);
  const q = s.questions[a.questionId];
  if (q?.type !== "reverse_points" || !q.choices?.length) fail("هذا السؤال لا يستخدم ترتيب النقاط");
  if (a.stage === "resolved") fail("تم إنهاء هذا السؤال — استخدم التراجع إن لزم");
  if (!Number.isInteger(rank) || rank < 0 || rank > q.choices.length) fail("المركز غير صالح");
  const limit = Math.max(1, Math.min(10, q.extra.rank_limit ?? 2));
  if (a.rankClaims[team].length >= limit) fail("اكتملت محاولات هذا الفريق");
  if (a.rankClaims[team].includes(rank)) fail("تم تسجيل هذه الإجابة مسبقًا");

  const points = rank === 0 ? 0 : Math.max(0, (a.basePoints - (rank - 1) * 100) * a.multiplier);
  const t = s.teams[team];
  const isSteal = team !== a.pickedBy;
  a.rankClaims[team].push(rank);
  if (points === 0) {
    t.stats.wrong += 1;
    t.streak = 0;
    emit(s, ctx, "wrong", team, 0, commentFor("wrong", {}, ctx.random), { rank: 0, rankTotal: q.choices.length });
    return;
  }
  t.score += points;
  t.stats.correct += 1;
  if (isSteal) t.stats.steals += 1;
  t.streak += 1;
  t.stats.maxStreak = Math.max(t.stats.maxStreak, t.streak);
  a.winner = team;
  a.awarded += points;
  const comment = commentFor("correct", { team: t.name, points }, ctx.random);
  emit(s, ctx, isSteal ? "steal_correct" : "correct", team, points, comment, { rank, rankTotal: q.choices.length, attempt: a.rankClaims[team].length });
}

/**
 * يطبق إجراء المضيف ويعيد حالة جديدة (لا يعدّل الحالة الأصلية).
 * يرمي GameRuleError إذا كان الإجراء غير مسموح.
 */
export function applyAction(prev: GameState, action: GameAction, ctx: EngineContext): GameState {
  const s: GameState = structuredClone(prev);
  const now = ctx.now;

  switch (action.type) {
    // ---------------------------------------------------- فتح سؤال
    case "OPEN_CELL": {
      if (s.phase !== "board") fail("اللوحة غير متاحة الآن");
      const cell = s.cells.find((c) => c.key === action.cellKey);
      if (!cell || cell.status !== "available" || !cell.questionId) fail("هذه الخانة غير متاحة");
      const q = s.questions[cell.questionId];
      if (!q) fail("السؤال غير موجود");

      const team = s.turn;
      let multiplier = 1;
      let noSteal = false;
      if (cell.mystery) {
        cell.mysteryRevealed = true;
        if (cell.mystery === "bonus") {
          s.teams[team].score += MYSTERY_BONUS_POINTS;
        } else if (cell.mystery === "double") {
          multiplier = 2;
        } else if (cell.mystery === "golden") {
          multiplier = 3;
          noSteal = true;
        }
      }

      s.phase = "question";
      s.active = {
        cellKey: cell.key,
        questionId: q.id,
        pickedBy: team,
        answeringTeam: team,
        stage: hasPowerups(s, team) ? "prep" : "answering",
        basePoints: cell.points,
        multiplier,
        doubleFor: null,
        noSteal,
        mystery: cell.mystery,
        removedChoices: [],
        cluesShown: q.type === "who_am_i" ? 1 : 0,
        openedAt: now,
        stageStartedAt: now,
        qrToken: isQrType(q.type) && ctx.newQrToken ? ctx.newQrToken() : null,
        mediaCue: 0,
        powerupsUsed: [],
        winner: null,
        awarded: 0,
        rankClaims: { A: [], B: [] },
      };
      if (s.active.stage === "answering") startTimer(s, s.settings.questionSeconds, "answer", now);
      else clearTimer(s);
      if (cell.mystery) {
        emit(s, ctx, "mystery", team, cell.mystery === "bonus" ? MYSTERY_BONUS_POINTS : 0, null, { mystery: cell.mystery });
      } else {
        emit(s, ctx, "open", team, cell.points);
      }
      break;
    }

    // ---------------------------------------------------- بدء السؤال بعد وسائل المساعدة
    case "START_QUESTION": {
      const a = requireActive(s);
      if (a.stage !== "prep") break;
      const extra = a.powerupsUsed.some((p) => p.powerup === "extra_time") ? EXTRA_TIME_SECONDS : 0;
      a.stage = "answering";
      a.openedAt = now;
      a.stageStartedAt = now;
      startTimer(s, s.settings.questionSeconds + extra, "answer", now);
      emit(s, ctx, "open", a.pickedBy, a.basePoints, null, { started: true });
      break;
    }

    // ---------------------------------------------------- إجابة صحيحة (أيضًا بعد إظهار الإجابة)
    case "MARK_CORRECT": {
      const a = requireActive(s);
      if (a.cellKey === "final") fail("استخدم تحكيم السؤال النهائي");
      requireStarted(a);
      if (a.stage === "resolved") fail("تم احتساب هذا السؤال — استخدم التراجع إن لزم");
      award(s, action.team, ctx);
      break;
    }

    case "MARK_RANK": {
      const a = requireActive(s);
      if (a.cellKey === "final") fail("استخدم تحكيم السؤال النهائي");
      requireStarted(a);
      awardRank(s, action.team, action.rank, ctx);
      break;
    }

    case "FINISH_RANKING": {
      const a = requireActive(s);
      const q = s.questions[a.questionId];
      if (a.cellKey === "final" || q?.type !== "reverse_points") fail("هذا الإجراء مخصص لأسئلة الترتيب");
      a.stage = "resolved";
      stopTimer(s, now);
      const cell = s.cells.find((c) => c.key === a.cellKey);
      if (cell) cell.wonBy = a.winner;
      emit(s, ctx, "reveal", null, a.awarded, null, { rankingFinished: true });
      break;
    }

    // ---------------------------------------------------- إجابة خاطئة
    case "MARK_WRONG": {
      const a = requireActive(s);
      if (a.cellKey === "final") fail("استخدم تحكيم السؤال النهائي");
      if (a.stage === "answering") {
        const t = s.teams[a.answeringTeam];
        t.stats.wrong += 1;
        t.streak = 0;
        const canSteal = !a.noSteal && s.settings.stealSeconds > 0;
        if (canSteal) {
          a.stage = "stealing";
          a.answeringTeam = otherTeam(a.pickedBy);
          a.stageStartedAt = now;
          startTimer(s, s.settings.stealSeconds, "steal", now);
          emit(s, ctx, "wrong", a.pickedBy, 0, commentFor("wrong", {}, ctx.random), { transfer: true });
        } else {
          a.stage = "failed";
          stopTimer(s, now);
          emit(s, ctx, "wrong", a.pickedBy, 0, commentFor("wrong", {}, ctx.random), { transfer: false });
        }
      } else if (a.stage === "stealing") {
        s.teams[a.answeringTeam].stats.wrong += 1;
        a.stage = "failed";
        stopTimer(s, now);
        emit(s, ctx, "wrong", a.answeringTeam, 0, commentFor("wrong", {}, ctx.random), { transfer: false });
      } else {
        fail("لا يمكن تسجيل خطأ في هذه المرحلة");
      }
      break;
    }

    // ---------------------------------------------------- تحويل للفريق الآخر (سرقة)
    case "TRANSFER": {
      const a = requireActive(s);
      if (a.cellKey === "final") fail("غير متاح في السؤال النهائي");
      requireStarted(a);
      if (a.stage !== "answering") fail("التحويل متاح فقط أثناء إجابة الفريق الأول");
      if (a.noSteal) fail("السرقة ممنوعة في هذا السؤال 🛡️");
      s.teams[a.pickedBy].streak = 0;
      a.stage = "stealing";
      a.answeringTeam = otherTeam(a.pickedBy);
      a.stageStartedAt = now;
      startTimer(s, s.settings.stealSeconds, "steal", now);
      emit(s, ctx, "transfer", a.answeringTeam, 0, null);
      break;
    }

    // ---------------------------------------------------- إظهار الإجابة
    case "REVEAL_ANSWER": {
      const a = requireActive(s);
      if (a.stage === "resolved" || a.stage === "revealed") break;
      requireStarted(a);
      a.stage = "revealed";
      stopTimer(s, now);
      emit(s, ctx, "reveal", null, 0, commentFor("reveal", {}, ctx.random));
      break;
    }

    // ---------------------------------------------------- العودة للوحة / تخطي
    case "BACK_TO_BOARD":
    case "SKIP": {
      const a = requireActive(s);
      if (a.cellKey === "final") fail("غير متاح في السؤال النهائي");
      const skipped = a.stage !== "resolved";
      closeQuestion(s, ctx);
      if (action.type === "SKIP" || skipped) {
        if (s.phase === "board") emit(s, ctx, "skip", null);
      }
      break;
    }

    // ---------------------------------------------------- إعادة السؤال من البداية
    case "RESTART_QUESTION": {
      const a = requireActive(s);
      if (a.stage === "resolved") fail("تم احتساب النقاط — استخدم «تراجع» أولًا");
      a.stage = "answering";
      a.answeringTeam = a.pickedBy;
      a.stageStartedAt = now;
      a.openedAt = now;
      a.winner = null;
      startTimer(s, a.cellKey === "final" ? s.settings.finalSeconds : s.settings.questionSeconds, a.cellKey === "final" ? "final" : "answer", now);
      emit(s, ctx, "open", a.pickedBy, a.basePoints, null, { restart: true });
      break;
    }

    // ---------------------------------------------------- إعادة فتح خانة مستخدمة
    case "REOPEN_CELL": {
      if (s.phase !== "board") fail("ارجع للوحة أولًا");
      const cell = s.cells.find((c) => c.key === action.cellKey);
      if (!cell || cell.status !== "used" || !cell.questionId) fail("هذه الخانة غير مستخدمة");
      cell.status = "available";
      cell.wonBy = null;
      break;
    }

    // ---------------------------------------------------- المؤقت
    case "PAUSE": {
      if (!s.timer.running) break;
      stopTimer(s, now);
      break;
    }
    case "RESUME": {
      if (s.timer.running || s.timer.remainingMs <= 0 || !s.timer.label) break;
      s.timer = { ...s.timer, running: true, endsAt: now + s.timer.remainingMs, expired: false };
      break;
    }
    case "ADD_TIME": {
      const ms = Math.max(1, Math.min(300, action.seconds)) * 1000;
      if (!s.timer.label) fail("لا يوجد مؤقت");
      if (s.timer.running && s.timer.endsAt !== null) {
        s.timer.endsAt += ms;
        s.timer.durationMs += ms;
      } else if (s.timer.expired || s.timer.remainingMs <= 0) {
        s.timer = { ...s.timer, running: true, endsAt: now + ms, remainingMs: ms, durationMs: ms, expired: false };
      } else {
        s.timer.remainingMs += ms;
        s.timer.durationMs += ms;
      }
      break;
    }
    case "TIME_UP": {
      if (!s.timer.running || s.timer.endsAt === null) break;
      if (now < s.timer.endsAt - 750) break; // ليس بعد
      s.timer = { ...s.timer, running: false, endsAt: null, remainingMs: 0, expired: true };
      emit(s, ctx, "timeup", s.active?.answeringTeam ?? null, 0, commentFor("timeup", {}, ctx.random));
      break;
    }

    // ---------------------------------------------------- النقاط والدور
    case "ADJUST_SCORE": {
      const delta = Math.trunc(action.delta);
      if (!Number.isFinite(delta) || delta === 0) break;
      s.teams[action.team].score += delta;
      emit(s, ctx, "score", action.team, delta);
      break;
    }
    case "SET_SCORE": {
      const score = Math.trunc(action.score);
      if (!Number.isFinite(score)) fail("قيمة غير صالحة");
      const delta = score - s.teams[action.team].score;
      s.teams[action.team].score = score;
      emit(s, ctx, "score", action.team, delta);
      break;
    }
    case "SET_TURN": {
      s.turn = action.team;
      if (s.active && (s.active.stage === "answering" || s.active.stage === "prep") && s.active.cellKey !== "final") {
        s.active.pickedBy = action.team;
        s.active.answeringTeam = action.team;
      }
      break;
    }

    // ---------------------------------------------------- وسائل المساعدة
    case "USE_POWERUP": {
      const a = requireActive(s);
      const { team, powerup } = action;
      if (a.cellKey === "final") fail("وسائل المساعدة غير متاحة في السؤال النهائي");
      if (!s.settings.powerupsEnabled || !s.settings.enabledPowerups.includes(powerup)) fail("وسيلة المساعدة غير مفعّلة");
      if (s.teams[team].powerups[powerup] !== "available") fail("تم استخدامها مسبقًا");
      if (a.stage !== "prep" && a.stage !== "answering" && a.stage !== "stealing") fail("متاحة فقط قبل السؤال أو أثناء الإجابة");
      const prep = a.stage === "prep";
      const q = s.questions[a.questionId];

      switch (powerup) {
        case "double":
          if (team !== a.answeringTeam) fail("المضاعفة للفريق الذي يجيب الآن");
          a.doubleFor = team;
          break;
        case "extra_time":
          if (team !== a.answeringTeam) fail("الوقت الإضافي للفريق الذي يجيب الآن");
          if (prep) {
            // يُضاف عند بدء السؤال
          } else if (s.timer.running && s.timer.endsAt !== null) {
            s.timer.endsAt += EXTRA_TIME_SECONDS * 1000;
            s.timer.durationMs += EXTRA_TIME_SECONDS * 1000;
          } else {
            s.timer.remainingMs += EXTRA_TIME_SECONDS * 1000;
          }
          break;
        case "no_steal":
          if (team !== a.pickedBy || (a.stage !== "answering" && !prep)) fail("يستخدمها الفريق صاحب السؤال قبل التحويل");
          a.noSteal = true;
          break;
        case "fifty_fifty": {
          if (!q || q.type !== "multiple_choice" || !q.choices || q.choices.length < 3) fail("50/50 للأسئلة ذات الاختيارات فقط");
          if (team !== a.answeringTeam) fail("50/50 للفريق الذي يجيب الآن");
          const wrong = q.choices.map((c, i) => ({ c, i })).filter((x) => x.c !== q.answer && !a.removedChoices.includes(x.i));
          const removeCount = Math.min(2, q.choices.length - 2);
          for (let k = 0; k < removeCount && wrong.length; k++) {
            const idx = Math.floor(ctx.random() * wrong.length);
            a.removedChoices.push(wrong[idx].i);
            wrong.splice(idx, 1);
          }
          break;
        }
      }
      s.teams[team].powerups[powerup] = "used";
      a.powerupsUsed.push({ team, powerup });
      emit(s, ctx, "powerup", team, 0, null, { powerup });
      break;
    }

    case "NEXT_CLUE": {
      const a = requireActive(s);
      const q = s.questions[a.questionId];
      const total = q?.clues?.length ?? 0;
      if (a.cluesShown < total) a.cluesShown += 1;
      break;
    }

    case "PLAY_MEDIA": {
      const a = requireActive(s);
      a.mediaCue += 1;
      break;
    }

    // ---------------------------------------------------- إنهاء اللوحة مبكرًا
    case "END_BOARD": {
      if (s.phase !== "board") fail("ارجع للوحة أولًا");
      enterEndOfBoard(s, ctx);
      break;
    }

    // ---------------------------------------------------- السؤال النهائي
    case "FINAL_SET_WAGER": {
      if (s.phase !== "final_wager" || !s.final) fail("مرحلة الرهان غير مفعّلة");
      const max = Math.max(0, s.teams[action.team].score);
      const amount = Math.max(0, Math.min(max, Math.trunc(action.amount)));
      s.final.wagers[action.team] = amount;
      emit(s, ctx, "final_wager", action.team, 0);
      break;
    }
    case "FINAL_START": {
      if (s.phase !== "final_wager" || !s.final?.questionId) fail("مرحلة الرهان غير مفعّلة");
      if (s.final.wagers.A === null || s.final.wagers.B === null) fail("ثبّتوا رهان الفريقين أولًا");
      s.phase = "final_question";
      s.active = {
        cellKey: "final",
        questionId: s.final.questionId,
        pickedBy: s.turn,
        answeringTeam: s.turn,
        stage: "answering",
        basePoints: 0,
        multiplier: 1,
        doubleFor: null,
        noSteal: true,
        mystery: null,
        removedChoices: [],
        cluesShown: 0,
        openedAt: now,
        stageStartedAt: now,
        qrToken: null,
        mediaCue: 0,
        powerupsUsed: [],
        winner: null,
        awarded: 0,
        rankClaims: { A: [], B: [] },
      };
      startTimer(s, s.settings.finalSeconds, "final", now);
      emit(s, ctx, "open", null, 0, null, { final: true });
      break;
    }
    case "FINAL_JUDGE": {
      if (s.phase !== "final_question" || !s.final) fail("السؤال النهائي غير مفتوح");
      const wager = s.final.wagers[action.team] ?? 0;
      const newDelta = action.correct ? wager : -wager;
      s.teams[action.team].score += newDelta - s.final.applied[action.team];
      s.final.applied[action.team] = newDelta;
      s.final.results[action.team] = action.correct;
      if (action.correct) s.teams[action.team].stats.correct += 1;
      emit(
        s,
        ctx,
        "final_result",
        action.team,
        newDelta,
        action.correct ? commentFor("correct", { team: s.teams[action.team].name, points: wager }, ctx.random) : commentFor("wrong", {}, ctx.random),
      );
      break;
    }
    case "FINAL_REVEAL": {
      if (s.phase !== "final_question" || !s.final || !s.active) fail("السؤال النهائي غير مفتوح");
      s.final.revealed = true;
      s.active.stage = "revealed";
      stopTimer(s, now);
      break;
    }

    case "FINISH": {
      if (s.phase === "finished" || s.phase === "closed") break;
      finish(s, ctx);
      break;
    }

    default: {
      const never: never = action;
      fail(`إجراء غير معروف: ${JSON.stringify(never)}`);
    }
  }

  s.updatedAt = now;
  return s;
}

/** الإجراءات التي لا تُسجل في سجل التراجع */
export const NON_UNDOABLE: GameAction["type"][] = ["TIME_UP", "PLAY_MEDIA", "PAUSE", "RESUME", "NEXT_CLUE"];

/**
 * عند التراجع نعيد الحالة السابقة، مع إزاحة المؤقت ليبقى الوقت المتبقي كما كان لحظة الإجراء.
 */
export function rebaseTimerForUndo(restored: GameState, actionAt: number, now: number, currentSeq: number): GameState {
  const s = structuredClone(restored);
  if (s.timer.running && s.timer.endsAt !== null) {
    const remaining = Math.max(0, s.timer.endsAt - actionAt);
    s.timer.endsAt = now + remaining;
  }
  s.eventSeq = Math.max(s.eventSeq, currentSeq) + 1;
  s.lastEvent = { id: s.eventSeq, kind: "undo", team: null, points: 0, comment: null, at: now };
  s.updatedAt = now;
  return s;
}
