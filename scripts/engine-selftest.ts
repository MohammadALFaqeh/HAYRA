// اختبار سريع لمحرك اللعبة: npm run test:engine
import assert from "node:assert/strict";
import { applyAction, rebaseTimerForUndo } from "../src/lib/game/engine";
import { createInitialState } from "../src/lib/game/factory";
import { toPublicState } from "../src/lib/game/public";
import { DEFAULT_SETTINGS, POINT_ROWS } from "../src/lib/game/constants";
import { SECONDS_LEAD_MS, parseSecondsInput, randomSecondsTarget } from "../src/lib/game/seconds";
import type { BoardCell, BoardColumn, GameAction, GameState, QuestionSnapshot } from "../src/lib/game/types";

let now = 1_000_000;
const ctx = () => ({ now, random: () => 0.42, newQrToken: () => "tok_" + now });
const step = (s: GameState, a: GameAction) => applyAction(s, a, ctx());
// فتح خانة ثم تخطي مرحلة وسائل المساعدة تلقائيًا (تُختبر صراحةً في القسم 9)
const run = (s: GameState, a: GameAction) => {
  const next = step(s, a);
  return a.type === "OPEN_CELL" && next.active?.stage === "prep" ? step(next, { type: "START_QUESTION" }) : next;
};

function q(id: string, over: Partial<QuestionSnapshot> = {}): QuestionSnapshot {
  return {
    id, type: "text", text: "سؤال " + id, answer: "جواب " + id, choices: null, clues: null, extra: {},
    imageUrl: null, audioUrl: null, videoUrl: null, explanation: null, source: null, reference: null,
    verified: true, difficulty: 3, categoryTitle: "عام", subcategoryName: null, ...over,
  };
}

const columns: BoardColumn[] = [0, 1, 2].map((i) => ({ key: `c${i}`, categoryId: `cat${i}`, subcategoryId: null, title: `فئة ${i}`, subtitle: null, icon: "❓", color: "gold" }));
const questions: Record<string, QuestionSnapshot> = {};
const cells: BoardCell[] = [];
columns.forEach((_, ci) =>
  POINT_ROWS.forEach((p, ri) => {
    const id = `q${ci}${ri}`;
    questions[id] = q(
      id,
      ri === 1 && ci === 0
        ? { type: "multiple_choice", choices: ["أ", "ب", "ج", "جواب q01"], answer: "جواب q01" }
        : ri === 3 && ci === 2
          ? { type: "reverse_points", choices: ["الأول", "الثاني", "الثالث", "الرابع"], answer: "الأول ← الثاني ← الثالث ← الرابع" }
          : {},
    );
    cells.push({ key: `c${ci}-r${ri}`, col: ci, row: ri, points: p, questionId: id, status: "available", mystery: null, mysteryRevealed: false, wonBy: null });
  }),
);
questions.final = q("final", { difficulty: 6 });
cells[5].mystery = "golden";

let s = createInitialState({
  sessionId: "s1", teamNames: ["النسور", "الفرسان"], settings: { ...DEFAULT_SETTINGS, streakThreshold: 2 },
  columns, cells, questions, finalQuestionId: "final", packName: null, now,
});

// 1) إجابة صحيحة
s = run(s, { type: "OPEN_CELL", cellKey: "c0-r0" });
assert.equal(s.phase, "question");
assert.equal(toPublicState(s).active?.question?.answer, null, "الإجابة يجب ألا تظهر للتلفزيون");
now += 3000;
s = run(s, { type: "MARK_CORRECT", team: "A" });
assert.equal(s.teams.A.score, 100);
assert.ok(s.lastEvent?.comment, "يجب أن يوجد تعليق");
assert.equal(toPublicState(s).active?.question?.answer, "جواب q00", "الإجابة تظهر بعد الاحتساب");
s = run(s, { type: "BACK_TO_BOARD" });
assert.equal(s.turn, "B");

// 2) خطأ ثم سرقة
s = run(s, { type: "OPEN_CELL", cellKey: "c1-r2" });
s = run(s, { type: "MARK_WRONG" });
assert.equal(s.active?.stage, "stealing");
assert.equal(s.active?.answeringTeam, "A");
s = run(s, { type: "MARK_CORRECT", team: "A" });
assert.equal(s.teams.A.score, 100 + 300 + DEFAULT_SETTINGS.streakBonus, "سرقة + مكافأة سلسلة (2)");
assert.equal(s.teams.A.stats.steals, 1);
s = run(s, { type: "BACK_TO_BOARD" });

// 3) تراجع
const before = s;
now += 1000;
s = run(s, { type: "ADJUST_SCORE", team: "B", delta: 500 });
assert.equal(s.teams.B.score, 500);
s = rebaseTimerForUndo(before, now, now + 10, s.eventSeq);
assert.equal(s.teams.B.score, 0);

// 4) وسائل مساعدة + 50/50
s = run(s, { type: "SET_TURN", team: "A" });
s = run(s, { type: "OPEN_CELL", cellKey: "c0-r1" });
s = run(s, { type: "USE_POWERUP", team: "A", powerup: "fifty_fifty" });
assert.equal(s.active?.removedChoices.length, 2);
assert.ok(!s.active!.removedChoices.includes(3), "لا تُحذف الإجابة الصحيحة");
s = run(s, { type: "USE_POWERUP", team: "A", powerup: "double" });
const aBefore = s.teams.A.score;
s = run(s, { type: "MARK_CORRECT", team: "A" });
assert.equal(s.teams.A.score - aBefore, 400, "مضاعفة 200×2");
assert.throws(() => run(s, { type: "USE_POWERUP", team: "A", powerup: "double" }));
s = run(s, { type: "BACK_TO_BOARD" });

// 5) نقاط عكسية: المركز الأول يأخذ كامل قيمة السؤال
s = run(s, { type: "SET_TURN", team: "A" });
s = run(s, { type: "OPEN_CELL", cellKey: "c2-r3" });
const rankBefore = s.teams.A.score;
s = run(s, { type: "MARK_RANK", team: "A", rank: 1 });
assert.equal(s.teams.A.score - rankBefore, 400);
s = run(s, { type: "MARK_RANK", team: "A", rank: 0 });
assert.equal(s.teams.A.score - rankBefore, 400, "الإجابة خارج القائمة لا تضيف نقاطًا");
s = run(s, { type: "MARK_RANK", team: "B", rank: 3 });
assert.equal(s.teams.B.score, 200, "المركز الثالث في سؤال قيمته 400 يساوي 200");
s = run(s, { type: "FINISH_RANKING" });
assert.equal(s.phase, "question");
s = run(s, { type: "BACK_TO_BOARD" });

// 6) خانة ذهبية: ×3 وبدون سرقة
s = run(s, { type: "SET_TURN", team: "B" });
s = run(s, { type: "OPEN_CELL", cellKey: "c0-r5" });
assert.equal(s.active?.multiplier, 3);
assert.throws(() => run(s, { type: "TRANSFER" }));
s = run(s, { type: "MARK_WRONG" });
assert.equal(s.active?.stage, "failed");
s = run(s, { type: "REVEAL_ANSWER" });
s = run(s, { type: "BACK_TO_BOARD" });

// 7) المؤقت
s = run(s, { type: "OPEN_CELL", cellKey: "c2-r0" });
now += 10_000;
s = run(s, { type: "PAUSE" });
assert.equal(s.timer.running, false);
assert.equal(s.timer.remainingMs, 50_000);
s = run(s, { type: "RESUME" });
now += 60_000;
s = run(s, { type: "TIME_UP" });
assert.equal(s.timer.expired, true);
s = run(s, { type: "SKIP" });

// 9) مرحلة وسائل المساعدة قبل السؤال + الاحتساب بعد إظهار الإجابة
{
  let t = createInitialState({
    sessionId: "s2", teamNames: ["أ", "ب"], settings: { ...DEFAULT_SETTINGS },
    columns, cells: structuredClone(cells).map((c) => ({ ...c, mystery: null, status: "available" as const })), questions, finalQuestionId: null, packName: null, now,
  });
  t = step(t, { type: "OPEN_CELL", cellKey: "c0-r0" });
  assert.equal(t.active?.stage, "prep", "المرحلة الأولى: وسائل المساعدة");
  assert.equal(t.timer.running, false, "المؤقت لا يبدأ قبل عرض السؤال");
  assert.equal(toPublicState(t).active?.question, null, "نص السؤال مخفي قبل البدء");
  assert.throws(() => step(t, { type: "MARK_CORRECT", team: "A" }), "لا تحكيم قبل البدء");
  t = step(t, { type: "USE_POWERUP", team: "A", powerup: "double" });
  t = step(t, { type: "USE_POWERUP", team: "A", powerup: "extra_time" });
  t = step(t, { type: "START_QUESTION" });
  assert.equal(t.active?.stage, "answering");
  assert.equal(t.timer.durationMs, (DEFAULT_SETTINGS.questionSeconds + 15) * 1000, "الوقت الإضافي يُضاف عند البدء");
  t = step(t, { type: "REVEAL_ANSWER" });
  assert.equal(t.active?.stage, "revealed");
  t = step(t, { type: "MARK_CORRECT", team: "A" });
  assert.equal(t.teams.A.score, 200, "الاحتساب بعد إظهار الإجابة مع المضاعفة");
  t = step(t, { type: "BACK_TO_BOARD" });
  // الفريق ب بدون وسائل؟ لديه وسائله كاملة → prep أيضًا، ويمكن التخطي مباشرة
  t = step(t, { type: "OPEN_CELL", cellKey: "c1-r0" });
  t = step(t, { type: "START_QUESTION" });
  t = step(t, { type: "REVEAL_ANSWER" });
  t = step(t, { type: "BACK_TO_BOARD" }); // لا أحد
  assert.equal(t.teams.B.score, 0);
}

// 7.5) ملك الثواني
{
  let t = s;
  const before = { A: t.teams.A.score, B: t.teams.B.score };
  t = step(t, { type: "SECONDS_OPEN", team: "A", level: 3, points: 500 });
  assert.equal(t.phase, "seconds");
  assert.throws(() => step(t, { type: "OPEN_CELL", cellKey: "c1-r1" }), "اللوحة مقفلة أثناء الفقرة");
  t = step(t, { type: "SECONDS_START", targetMs: 12_345 });
  assert.equal(toPublicState(t).seconds?.targetMs, null, "الوقت الحقيقي سري على التلفزيون");
  assert.throws(() => step(t, { type: "SECONDS_GUESS", guessMs: 12_000 }), "لا تخمين قبل توقف العداد");
  now += SECONDS_LEAD_MS + 12_345;
  t = step(t, { type: "SECONDS_GUESS", guessMs: 12_500 }); // فرق 0.155 > 0.1
  assert.equal(t.seconds?.stage, "missed");
  assert.equal(t.teams.A.score, before.A);
  assert.equal(toPublicState(t).seconds?.targetMs, null, "لا يُكشف الوقت قبل السرقة");
  assert.equal(t.lastEvent?.meta?.targetMs, undefined, "حدث الخطأ لا يكشف الوقت");
  t = step(t, { type: "SECONDS_TRANSFER" });
  t = step(t, { type: "SECONDS_GUESS", guessMs: 12_300 }); // فرق 0.045
  assert.equal(t.seconds?.stage, "done");
  assert.equal(t.seconds?.winner, "B");
  assert.equal(t.teams.B.score, before.B + 500);
  assert.equal(toPublicState(t).seconds?.targetMs, 12_345);

  // جولة جديدة سهلة: الحد ±0.3 شامل
  t = step(t, { type: "SECONDS_OPEN", team: "B", level: 1, points: 100 });
  t = step(t, { type: "SECONDS_START", targetMs: 5_000 });
  now += SECONDS_LEAD_MS + 5_000;
  t = step(t, { type: "SECONDS_GUESS", guessMs: 5_300 });
  assert.equal(t.seconds?.winner, "B", "±0.3 على الحد يُحتسب");
  t = step(t, { type: "SECONDS_CLOSE" });
  assert.equal(t.phase, "board");
  assert.equal(t.seconds, null);

  assert.equal(parseSecondsInput("٧٫٤٥"), 7_450);
  assert.equal(parseSecondsInput("12,3"), 12_300);
  assert.equal(parseSecondsInput("abc"), null);
  for (const lv of [1, 2, 3] as const) {
    for (const r of [0, 0.37, 0.999]) {
      const ms = randomSecondsTarget(lv, () => r);
      assert.ok(ms >= 3_000 && ms <= 25_000);
      assert.equal(ms % [100, 10, 1][lv - 1], 0, "الدقة حسب المستوى");
    }
  }
}

// 8) السؤال النهائي
s = run(s, { type: "END_BOARD" });
assert.equal(s.phase, "final_wager");
const aScore = s.teams.A.score;
s = run(s, { type: "FINAL_SET_WAGER", team: "A", amount: 999_999 });
assert.equal(s.final?.wagers.A, aScore, "الرهان لا يتجاوز الرصيد");
s = run(s, { type: "FINAL_SET_WAGER", team: "B", amount: 0 });
assert.equal(toPublicState(s).final?.wagers.A, null, "الرهان سري على التلفزيون");
s = run(s, { type: "FINAL_START" });
s = run(s, { type: "FINAL_JUDGE", team: "A", correct: false });
assert.equal(s.teams.A.score, 0);
s = run(s, { type: "FINAL_JUDGE", team: "A", correct: true });
assert.equal(s.teams.A.score, aScore * 2, "تغيير الحكم يعيد الحساب");
s = run(s, { type: "FINAL_JUDGE", team: "B", correct: true });
s = run(s, { type: "FINAL_REVEAL" });
s = run(s, { type: "FINISH" });
assert.equal(s.phase, "finished");
assert.equal(s.lastEvent?.team, "A");

console.log("✅ كل اختبارات المحرك نجحت. النتيجة:", s.teams.A.name, s.teams.A.score, "—", s.teams.B.name, s.teams.B.score);
