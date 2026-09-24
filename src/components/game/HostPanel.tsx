"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowRight,
  BookOpen,
  Check,
  CloudOff,
  Eye,
  Flag,
  Loader2,
  MonitorPlay,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Tv,
  Undo2,
  X,
} from "lucide-react";
import { useClockSync, useCountdown } from "@/lib/client/clock";
import { useHostSession } from "@/lib/client/use-host-session";
import { play, unlockAudio } from "@/lib/client/sound";
import { toPublicState } from "@/lib/game/public";
import { MYSTERY, POWERUPS, QUESTION_TYPES, isQrType } from "@/lib/game/constants";
import type { GameState, PowerupId, TeamId } from "@/lib/game/types";
import { FEEDBACK_LABELS, type FeedbackRating } from "@/lib/db/types";
import { cn, formatPoints, seconds, TEAM_COLORS } from "@/lib/utils";
import { Button, Modal, Spinner, Toast } from "@/components/ui";
import { Logo } from "@/components/ui/Logo";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { Board } from "./Board";
import { ResultsView } from "./ResultsView";
import { Scoreboard } from "./Scoreboard";

export function HostPanel({ sessionId }: { sessionId: string }) {
  useClockSync();
  const router = useRouter();
  const h = useHostSession(sessionId);
  const [origin, setOrigin] = useState("");
  const [pairOpen, setPairOpen] = useState(false);
  const [scoreTeam, setScoreTeam] = useState<TeamId | null>(null);
  const [reopenKey, setReopenKey] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);

  // أول مرة بعد إنشاء اللعبة → افتح نافذة ربط التلفزيون
  useEffect(() => {
    if (h.status === "ready" && h.state && h.state.eventSeq === 0 && sessionStorage.getItem(`hayra:paired:${sessionId}`) !== "1") {
      sessionStorage.setItem(`hayra:paired:${sessionId}`, "1");
      setPairOpen(true);
    }
  }, [h.status, h.state, sessionId]);

  if (h.status === "loading") {
    return (
      <main className="grid min-h-dvh place-items-center">
        <Spinner label="جارٍ تحميل اللعبة…" />
      </main>
    );
  }
  if (h.status !== "ready" || !h.state) {
    const msg =
      h.status === "missing"
        ? "انتهت هذه الجلسة أو تم حذفها."
        : h.status === "forbidden"
          ? "مفتاح المضيف غير صحيح لهذه الجلسة."
          : "هذا الجهاز ليس جهاز المضيف. افتح رابط المضيف من الجهاز الذي أنشأ اللعبة.";
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="space-y-5">
          <Logo size={160} />
          <p className="text-xl">{msg}</p>
          <div className="flex justify-center gap-3">
            <Link href={`/game/${sessionId}/tv`} className="rounded-2xl bg-white/10 px-5 py-3 font-bold">
              فتح شاشة العرض
            </Link>
            <Link href="/" className="rounded-2xl bg-gold-400 px-5 py-3 font-bold text-night-950">
              الرئيسية
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const s = h.state;
  const pub = toPublicState(s);
  const act = (a: Parameters<typeof h.dispatch>[0]) => {
    unlockAudio();
    play("click");
    void h.dispatch(a);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 px-3 pb-28 pt-3" onPointerDown={() => unlockAudio()}>
      {/* شريط علوي */}
      <header className="flex items-center gap-2">
        <Logo size={56} glow={false} className="mx-0" />
        <div className="flex-1 text-sm">
          <div className="font-display font-bold">لوحة المضيف {s.packName && <span className="text-white/50">— {s.packName}</span>}</div>
          <div className="flex items-center gap-1.5 text-xs text-white/55">
            {h.online ? <span className="h-2 w-2 rounded-full bg-leaf-400" /> : <CloudOff className="h-3.5 w-3.5 text-ember-400" />}
            {h.online ? "متصل" : "بدون إنترنت — الإجراءات محفوظة"}
            {h.pending > 0 && <span className="text-ember-400">({h.pending} بانتظار الإرسال)</span>}
          </div>
        </div>
        <button onClick={() => setPairOpen(true)} className="rounded-full bg-white/[0.07] p-2.5" aria-label="ربط التلفزيون">
          <Tv className="h-5 w-5" />
        </button>
        <SoundToggle />
      </header>

      <Scoreboard teams={s.teams} turn={s.turn} answering={s.active?.answeringTeam} size="sm" onTeamClick={setScoreTeam} />
      <p className="-mt-2 text-center text-xs text-white/40">اضغط على الفريق لتعديل النقاط أو الدور</p>

      {s.phase === "board" && (
        <section className="panel space-y-3 p-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">
              اختر سؤالًا لـ <span className={TEAM_COLORS[s.turn].text}>{s.teams[s.turn].name}</span>
            </h2>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/[0.06] px-2 py-1 text-xs text-white/50">{s.cells.filter((c) => c.status === "used").length}/{s.cells.filter((c) => c.status !== "empty").length}</span>
              <Button size="sm" variant="ghost" icon={<Flag className="h-4 w-4" />} onClick={() => setConfirmEnd(true)}>إنهاء اللوحة</Button>
            </div>
          </div>
          <Board
            compact
            columns={pub.columns}
            cells={pub.cells}
            hostMysteryKinds={Object.fromEntries(s.cells.map((c) => [c.key, c.mystery]))}
            onPick={(cell) => (cell.status === "available" ? act({ type: "OPEN_CELL", cellKey: cell.key }) : setReopenKey(cell.key))}
          />
        </section>
      )}

      {s.phase === "question" && s.active && <QuestionControls state={s} act={act} host={h} onInfo={setInfo} />}

      {s.phase === "final_wager" && <FinalWagerControls state={s} act={act} />}
      {s.phase === "final_question" && <FinalQuestionControls state={s} act={act} />}

      {s.phase === "finished" && (
        <section className="panel p-4">
          <ResultsView
            teams={s.teams}
            actions={
              <div className="flex w-full flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  className="flex-1"
                  onClick={async () => {
                    await h.endSession();
                    router.push("/play/new");
                  }}
                >
                  🎮 لعبة جديدة
                </Button>
                <Button
                  size="lg"
                  variant="soft"
                  className="flex-1"
                  onClick={async () => {
                    await h.endSession();
                    router.push("/");
                  }}
                >
                  العودة للرئيسية
                </Button>
              </div>
            }
          />
          <p className="mt-4 text-center text-xs text-white/40">عند الخروج تُحذف الجلسة نهائيًا (الأسئلة تبقى في البنك).</p>
        </section>
      )}

      {/* شريط سفلي ثابت: التراجع */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-night-950/90 px-3 py-3 backdrop-blur" style={{ paddingBottom: "max(.75rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-3xl gap-2">
          <Button variant="soft" className="flex-1" icon={<Undo2 className="h-5 w-5" />} disabled={!h.canUndo} onClick={() => act({ type: "UNDO" })}>
            تراجع
          </Button>
          <Link href={`/game/${sessionId}/tv`} target="_blank" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-white/[0.07] px-4 font-bold">
            <MonitorPlay className="h-5 w-5" /> العرض
          </Link>
          {s.phase !== "finished" && (
            <Button variant="ghost" onClick={() => setConfirmEnd(true)}>
              إنهاء
            </Button>
          )}
        </div>
      </div>

      {/* نوافذ */}
      <PairModal open={pairOpen} onClose={() => setPairOpen(false)} origin={origin} sessionId={sessionId} hostKey={h.hostKey()} />
      <ScoreModal team={scoreTeam} state={s} onClose={() => setScoreTeam(null)} act={act} />
      <Modal open={!!reopenKey} onClose={() => setReopenKey(null)} title="خانة مستخدمة">
        <p className="mb-4 text-white/70">تريد إعادة فتح هذه الخانة لتصبح متاحة مرة أخرى؟</p>
        <Button
          className="w-full"
          icon={<RotateCcw className="h-5 w-5" />}
          onClick={() => {
            if (reopenKey) act({ type: "REOPEN_CELL", cellKey: reopenKey });
            setReopenKey(null);
          }}
        >
          إعادة فتح السؤال
        </Button>
      </Modal>
      <Modal open={confirmEnd} onClose={() => setConfirmEnd(false)} title="إنهاء اللعبة؟">
        <p className="mb-4 text-white/70">
          {s.phase === "board" && s.final && s.settings.finalEnabled
            ? "سيتم الانتقال للسؤال النهائي مباشرة."
            : "سيتم عرض النتيجة النهائية الآن."}
        </p>
        <div className="flex gap-2">
          <Button
            className="flex-1"
            variant="danger"
            onClick={() => {
              act(s.phase === "board" ? { type: "END_BOARD" } : { type: "FINISH" });
              setConfirmEnd(false);
            }}
          >
            نعم، إنهاء
          </Button>
          {s.phase === "board" && s.final && (
            <Button
              className="flex-1"
              variant="soft"
              onClick={() => {
                act({ type: "FINISH" });
                setConfirmEnd(false);
              }}
            >
              بدون سؤال نهائي
            </Button>
          )}
        </div>
      </Modal>
      <Toast message={h.error} onClose={h.clearError} />
      <Toast message={info} onClose={() => setInfo(null)} tone="info" />
    </main>
  );
}

type Act = (a: Parameters<ReturnType<typeof useHostSession>["dispatch"]>[0]) => void;

// ======================================================================
// التحكم بالسؤال
// ======================================================================
function QuestionControls({
  state: s,
  act,
  host,
  onInfo,
}: {
  state: GameState;
  act: Act;
  host: ReturnType<typeof useHostSession>;
  onInfo: (m: string) => void;
}) {
  const a = s.active!;
  const q = s.questions[a.questionId];
  const remaining = useCountdown(s.timer);
  const [showSource, setShowSource] = useState(false);
  const [rated, setRated] = useState<string | null>(null);
  const timeUpSent = useRef<number | null>(null);

  // إرسال «انتهى الوقت» تلقائيًا من جهاز المضيف
  useEffect(() => {
    if (s.timer.running && s.timer.endsAt && remaining <= 0 && timeUpSent.current !== s.timer.endsAt) {
      timeUpSent.current = s.timer.endsAt;
      void host.dispatch({ type: "TIME_UP" });
    }
  }, [remaining, s.timer.running, s.timer.endsAt, host]);

  useEffect(() => setRated(null), [a.questionId]);

  if (!q) return null;
  const settled = a.stage === "resolved" || a.stage === "revealed";
  const points = a.basePoints * a.multiplier;
  const other: TeamId = a.pickedBy === "A" ? "B" : "A";
  const qr = isQrType(q.type);
  const stageLabel: Record<string, string> = {
    answering: `🎯 ${s.teams[a.answeringTeam].name} يجيب`,
    stealing: `🦊 فرصة سرقة لـ ${s.teams[a.answeringTeam].name}`,
    failed: "❌ لم يعرفها أحد",
    revealed: "👀 ظهرت الإجابة",
    resolved: `✅ احتُسبت لـ ${a.winner ? s.teams[a.winner].name : ""} (+${formatPoints(a.awarded)})`,
  };

  return (
    <section className="space-y-3">
      <div className="panel space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-white/10 px-3 py-1">
            {q.categoryTitle}
            {q.subcategoryName && ` / ${q.subcategoryName}`}
          </span>
          <span className="gold-text font-display text-xl font-extrabold">{formatPoints(points)}</span>
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs">{QUESTION_TYPES[q.type].name}</span>
          {a.mystery && <span className="rounded-full bg-violet-500/25 px-2 py-0.5 text-xs text-violet-400">{MYSTERY[a.mystery].icon} {MYSTERY[a.mystery].name}</span>}
          {!q.verified && <span className="rounded-full bg-ember-500/20 px-2 py-0.5 text-xs text-ember-400">غير موثّق</span>}
        </div>
        <p className="font-display text-xl font-bold leading-relaxed">{q.text}</p>
        {q.type === "individual" && q.extra?.target && <p className="rounded-xl bg-volt-500/10 px-3 py-2 text-sm font-bold text-volt-400">🎯 موجّه إلى: {q.extra.target}</p>}
        {q.extra?.quote && <p className="quran rounded-2xl bg-gold-400/[0.07] px-4 py-2 text-xl text-gold-200">﴿ {q.extra.quote} ﴾</p>}
        {q.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={q.imageUrl} alt="" className="max-h-40 rounded-2xl bg-white/5 object-contain p-1" />
        )}
        {q.choices && (
          <ul className="grid grid-cols-2 gap-1.5 text-sm">
            {q.choices.map((c, i) => (
              <li
                key={i}
                className={cn(
                  "rounded-xl px-3 py-1.5",
                  c === q.answer ? "bg-leaf-500/20 text-leaf-400" : "bg-white/[0.04]",
                  a.removedChoices.includes(i) && "line-through opacity-30",
                )}
              >
                {c}
              </li>
            ))}
          </ul>
        )}
        {q.extra?.forbidden?.length ? (
          <p className="text-sm text-wine-400">🚫 كلمات ممنوعة: {q.extra.forbidden.join("، ")}</p>
        ) : null}
        {q.extra?.instructions && <p className="text-sm text-white/60">📋 {q.extra.instructions}</p>}

        {/* الإجابة — للمضيف فقط */}
        <div className="rounded-2xl border border-leaf-400/40 bg-leaf-500/10 px-4 py-3">
          <div className="text-xs text-leaf-400">الإجابة (تظهر لك فقط)</div>
          <div className={cn("text-lg font-bold", q.extra?.answer_is_quote && "quran text-xl font-normal")}>{q.answer}</div>
          {q.explanation && <div className="text-sm text-white/60">{q.explanation}</div>}
        </div>

        <button onClick={() => setShowSource((v) => !v)} className="flex items-center gap-1.5 text-sm text-volt-400">
          <BookOpen className="h-4 w-4" /> {showSource ? "إخفاء المصدر" : "عرض المصدر"}
        </button>
        {showSource && (
          <div className="rounded-xl bg-white/[0.04] p-3 text-sm text-white/70">
            <div>المصدر: {q.source || "—"}</div>
            <div>المرجع: {q.reference || "—"}</div>
            <div>الحالة: {q.verified ? "موثّق ✅" : "غير موثّق ⚠️"}</div>
          </div>
        )}
      </div>

      {/* الحالة والمؤقت */}
      <div className="panel flex items-center gap-3 p-3">
        <div className={cn("flex-1 font-display text-lg font-bold", a.stage === "answering" || a.stage === "stealing" ? TEAM_COLORS[a.answeringTeam].text : "")}>
          {stageLabel[a.stage]}
        </div>
        {s.timer.label && (
          <div className={cn("font-display text-3xl font-extrabold tabular-nums", seconds(remaining) <= 5 ? "text-wine-400" : "text-gold-300")}>
            {s.timer.expired ? "0" : seconds(remaining)}
          </div>
        )}
        {s.timer.label && !settled && (
          <div className="flex gap-1">
            {s.timer.running ? (
              <IconBtn label="إيقاف مؤقت" onClick={() => act({ type: "PAUSE" })}>
                <Pause className="h-5 w-5" />
              </IconBtn>
            ) : (
              <IconBtn label="استئناف" onClick={() => act({ type: "RESUME" })} disabled={s.timer.expired}>
                <Play className="h-5 w-5" />
              </IconBtn>
            )}
            <IconBtn label="+15 ثانية" onClick={() => act({ type: "ADD_TIME", seconds: 15 })}>
              <Plus className="h-5 w-5" />
            </IconBtn>
          </div>
        )}
      </div>

      {/* أزرار التحكيم */}
        {!settled && q.type === "reverse_points" && q.choices && (
          <div className="panel space-y-4 p-3">
            <div>
              <div className="text-sm font-semibold text-white/70">النقاط العكسية: تسجيل يدوي من المضيف</div>
              <div className="text-xs text-white/45">اسمع إجابة الفريق واضغط قيمة النقاط المناسبة. لا أحد يكتب إجابة.</div>
            </div>
            {(["A", "B"] as TeamId[]).map((team) => {
              const claims = a.rankClaims[team];
              return (
                <div key={team} className="space-y-2 rounded-2xl bg-white/[0.04] p-3">
                  <div className={cn("font-display font-bold", TEAM_COLORS[team].text)}>{s.teams[team].name} ({claims.length}/2)</div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {q.choices!.map((_, i) => {
                      const points = Math.max(0, a.basePoints - i * 100);
                      return (
                        <Button key={i} size="sm" variant={i === 0 ? "gold" : "soft"} disabled={claims.length >= 2 || claims.includes(i + 1)} onClick={() => act({ type: "MARK_RANK", team, rank: i + 1 })}>
                          +{points} نقطة
                        </Button>
                      );
                    })}
                    <Button size="sm" variant="danger" disabled={claims.length >= 2 || claims.includes(0)} onClick={() => act({ type: "MARK_RANK", team, rank: 0 })}>
                      خارج القائمة (0)
                    </Button>
                  </div>
                </div>
              );
            })}
            <Button size="lg" className="w-full" icon={<Check className="h-5 w-5" />} onClick={() => act({ type: "FINISH_RANKING" })}>
              إنهاء فقرة الترتيب وعرض النتيجة
            </Button>
          </div>
        )}

      {!settled && q.type !== "reverse_points" && (
        <div className="grid grid-cols-2 gap-2">
          <Button size="xl" variant="success" icon={<Check className="h-6 w-6" />} onClick={() => act({ type: "MARK_CORRECT", team: "A" })} className="border-2 border-gold-400/60">
            صح لـ {s.teams.A.name}
          </Button>
          <Button size="xl" variant="success" icon={<Check className="h-6 w-6" />} onClick={() => act({ type: "MARK_CORRECT", team: "B" })} className="border-2 border-volt-400/60">
            صح لـ {s.teams.B.name}
          </Button>
          {(a.stage === "answering" || a.stage === "stealing") && (
            <Button size="lg" variant="danger" icon={<X className="h-5 w-5" />} onClick={() => act({ type: "MARK_WRONG" })}>
              خطأ
            </Button>
          )}
          {a.stage === "answering" && !a.noSteal && (
            <Button size="lg" variant="volt" icon={<ArrowRight className="h-5 w-5" />} onClick={() => act({ type: "TRANSFER" })}>
              تحويل لـ {s.teams[other].name}
            </Button>
          )}
          <Button size="lg" variant="soft" icon={<Eye className="h-5 w-5" />} onClick={() => act({ type: "REVEAL_ANSWER" })}>
            إظهار الإجابة
          </Button>
          <Button size="lg" variant="soft" icon={<SkipForward className="h-5 w-5" />} onClick={() => act({ type: "SKIP" })}>
            تخطي
          </Button>
        </div>
      )}

      {/* أدوات إضافية */}
      {!settled && (
        <div className="flex flex-wrap gap-2">
          {q.clues && a.cluesShown < q.clues.length && (
            <Button size="sm" variant="soft" onClick={() => act({ type: "NEXT_CLUE" })}>
              💡 تلميح التالي ({a.cluesShown}/{q.clues.length})
            </Button>
          )}
          {(q.audioUrl || q.videoUrl) && (
            <Button size="sm" variant="soft" onClick={() => act({ type: "PLAY_MEDIA" })}>
              🔊 تشغيل على الشاشة
            </Button>
          )}
          {qr && (
            <Button
              size="sm"
              variant="soft"
              onClick={async () => onInfo((await host.resetQr()) ? "يمكن الآن فتح رمز QR من جهاز آخر" : "تعذر إعادة ضبط الرمز")}
            >
              📱 إعادة ضبط QR
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => act({ type: "RESTART_QUESTION" })}>
            إعادة السؤال
          </Button>
        </div>
      )}

      {/* وسائل المساعدة */}
      {!settled && s.settings.powerupsEnabled && (a.stage === "answering" || a.stage === "stealing") && (
        <div className="panel space-y-2 p-3">
          <div className="text-sm font-semibold text-white/60">وسائل المساعدة</div>
          {(["A", "B"] as TeamId[]).map((t) => (
            <div key={t} className="flex flex-wrap items-center gap-1.5">
              <span className={cn("w-20 truncate text-sm font-bold", TEAM_COLORS[t].text)}>{s.teams[t].name}</span>
              {(Object.keys(POWERUPS) as PowerupId[])
                .filter((p) => s.teams[t].powerups[p] !== "disabled")
                .map((p) => (
                  <button
                    key={p}
                    disabled={s.teams[t].powerups[p] !== "available"}
                    onClick={() => act({ type: "USE_POWERUP", team: t, powerup: p })}
                    className="rounded-xl bg-white/[0.07] px-2.5 py-1.5 text-xs font-semibold disabled:opacity-25"
                    title={POWERUPS[p].desc}
                  >
                    {POWERUPS[p].icon} {POWERUPS[p].name}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}

      {/* بعد انتهاء السؤال */}
      {settled && (
        <div className="space-y-3">
          <Button size="xl" className="w-full" onClick={() => act({ type: "BACK_TO_BOARD" })}>
            العودة للوحة ↩
          </Button>
          <div className="panel p-3">
            <div className="mb-2 text-sm text-white/60">قيّم السؤال (يساعد في مراجعة البنك):</div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(FEEDBACK_LABELS) as FeedbackRating[]).map((r) => (
                <button
                  key={r}
                  disabled={!!rated}
                  onClick={async () => {
                    setRated(r);
                    if (!(await host.sendFeedback(q.id, r))) setRated(null);
                  }}
                  className={cn("rounded-xl px-3 py-1.5 text-xs font-semibold", rated === r ? "bg-gold-400 text-night-950" : "bg-white/[0.07] disabled:opacity-40")}
                >
                  {FEEDBACK_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function IconBtn({ children, label, onClick, disabled }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label} className="grid h-11 w-11 place-items-center rounded-xl bg-white/[0.08] disabled:opacity-30">
      {children}
    </button>
  );
}

// ======================================================================
// السؤال النهائي
// ======================================================================
function FinalWagerControls({ state: s, act }: { state: GameState; act: Act }) {
  const [values, setValues] = useState<Record<TeamId, number>>({ A: 0, B: 0 });
  const f = s.final!;
  return (
    <section className="panel space-y-4 p-4">
      <div className="text-center">
        <div className="text-4xl">👑</div>
        <h2 className="font-display text-2xl font-extrabold">رهان السؤال النهائي</h2>
        <p className="text-sm text-white/60">كل فريق يهمس لك برهانه (من 0 حتى رصيده). الرهانات لا تظهر على الشاشة حتى التحكيم.</p>
      </div>
      {(["A", "B"] as TeamId[]).map((t) => {
        const max = Math.max(0, s.teams[t].score);
        const locked = f.wagers[t] !== null;
        return (
          <div key={t} className={cn("space-y-2 rounded-2xl border p-3", locked ? "border-leaf-400/50 bg-leaf-500/10" : "border-white/10")}>
            <div className="flex justify-between">
              <span className={cn("font-bold", TEAM_COLORS[t].text)}>{s.teams[t].name}</span>
              <span className="text-sm text-white/60">الحد: {formatPoints(max)}</span>
            </div>
            {locked ? (
              <div className="flex items-center justify-between">
                <span>🔒 الرهان: {formatPoints(f.wagers[t]!)}</span>
                <Button size="sm" variant="ghost" onClick={() => act({ type: "FINAL_SET_WAGER", team: t, amount: values[t] })}>
                  تعديل
                </Button>
              </div>
            ) : (
              <>
                <input
                  type="range"
                  min={0}
                  max={max}
                  step={50}
                  value={values[t]}
                  onChange={(e) => setValues((v) => ({ ...v, [t]: Number(e.target.value) }))}
                  className="w-full"
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={max}
                    value={values[t]}
                    onChange={(e) => setValues((v) => ({ ...v, [t]: Math.max(0, Math.min(max, Number(e.target.value) || 0)) }))}
                    className="w-full"
                  />
                  <Button onClick={() => act({ type: "FINAL_SET_WAGER", team: t, amount: values[t] })}>تثبيت</Button>
                </div>
              </>
            )}
          </div>
        );
      })}
      <Button size="xl" className="w-full" disabled={f.wagers.A === null || f.wagers.B === null} onClick={() => act({ type: "FINAL_START" })}>
        اعرض السؤال النهائي 🎬
      </Button>
    </section>
  );
}

function FinalQuestionControls({ state: s, act }: { state: GameState; act: Act }) {
  const f = s.final!;
  const q = f.questionId ? s.questions[f.questionId] : null;
  const remaining = useCountdown(s.timer);
  if (!q) return null;
  return (
    <section className="space-y-3">
      <div className="panel space-y-3 p-4">
        <div className="flex items-center justify-between">
          <span className="gold-text font-display text-xl font-extrabold">السؤال النهائي 👑</span>
          {s.timer.label && <span className="font-display text-3xl font-extrabold tabular-nums text-gold-300">{seconds(remaining)}</span>}
        </div>
        <p className="font-display text-xl font-bold">{q.text}</p>
        {q.extra?.quote && <p className="quran text-xl text-gold-200">﴿ {q.extra.quote} ﴾</p>}
        <div className="rounded-2xl border border-leaf-400/40 bg-leaf-500/10 px-4 py-3">
          <div className="text-xs text-leaf-400">الإجابة</div>
          <div className="text-lg font-bold">{q.answer}</div>
        </div>
        <div className="flex gap-2">
          {s.timer.running ? (
            <Button size="sm" variant="soft" onClick={() => act({ type: "PAUSE" })}>
              ⏸ إيقاف
            </Button>
          ) : (
            <Button size="sm" variant="soft" onClick={() => act({ type: "RESUME" })}>
              ▶ استئناف
            </Button>
          )}
          <Button size="sm" variant="soft" onClick={() => act({ type: "ADD_TIME", seconds: 15 })}>
            +15 ث
          </Button>
        </div>
      </div>
      {(["A", "B"] as TeamId[]).map((t) => (
        <div key={t} className="panel flex items-center gap-2 p-3">
          <div className="flex-1">
            <div className={cn("font-bold", TEAM_COLORS[t].text)}>{s.teams[t].name}</div>
            <div className="text-sm text-white/55">
              الرهان {formatPoints(f.wagers[t] ?? 0)} — {f.results[t] === null ? "لم يُحكَم" : f.results[t] ? "✅ صح" : "❌ خطأ"}
            </div>
          </div>
          <Button size="sm" variant="success" onClick={() => act({ type: "FINAL_JUDGE", team: t, correct: true })}>
            صح
          </Button>
          <Button size="sm" variant="danger" onClick={() => act({ type: "FINAL_JUDGE", team: t, correct: false })}>
            خطأ
          </Button>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" variant="soft" icon={<Eye className="h-5 w-5" />} disabled={f.revealed} onClick={() => act({ type: "FINAL_REVEAL" })}>
          إظهار الإجابة
        </Button>
        <Button size="lg" disabled={f.results.A === null || f.results.B === null} onClick={() => act({ type: "FINISH" })}>
          🏆 النتيجة النهائية
        </Button>
      </div>
    </section>
  );
}

// ======================================================================
// النقاط والدور
// ======================================================================
function ScoreModal({ team, state: s, onClose, act }: { team: TeamId | null; state: GameState; onClose: () => void; act: Act }) {
  const [custom, setCustom] = useState("");
  const [exact, setExact] = useState("");
  useEffect(() => {
    setCustom("");
    setExact(team ? String(s.teams[team].score) : "");
  }, [team, s.teams]);
  if (!team) return null;
  return (
    <Modal open onClose={onClose} title={`نقاط ${s.teams[team].name}`}>
      <div className="space-y-4">
        <div className={cn("text-center font-display text-5xl font-extrabold", TEAM_COLORS[team].text)}>{formatPoints(s.teams[team].score)}</div>
        <div className="grid grid-cols-4 gap-2">
          {[100, 200, -100, -200].map((d) => (
            <Button key={d} variant={d > 0 ? "success" : "danger"} size="sm" onClick={() => act({ type: "ADJUST_SCORE", team, delta: d })}>
              {d > 0 ? `+${d}` : d}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="number" inputMode="numeric" placeholder="إضافة/خصم (مثال: -300)" value={custom} onChange={(e) => setCustom(e.target.value)} className="w-full" />
          <Button
            variant="soft"
            disabled={!Number(custom)}
            onClick={() => {
              act({ type: "ADJUST_SCORE", team, delta: Number(custom) });
              setCustom("");
            }}
          >
            تطبيق
          </Button>
        </div>
        <div className="flex gap-2">
          <input type="number" inputMode="numeric" placeholder="تعديل الرصيد مباشرة" value={exact} onChange={(e) => setExact(e.target.value)} className="w-full" />
          <Button variant="soft" disabled={exact === ""} onClick={() => act({ type: "SET_SCORE", team, score: Number(exact) })}>
            تعيين
          </Button>
        </div>
        {s.turn !== team && (
          <Button
            variant="volt"
            className="w-full"
            onClick={() => {
              act({ type: "SET_TURN", team });
              onClose();
            }}
          >
            اجعل الدور لـ {s.teams[team].name}
          </Button>
        )}
      </div>
    </Modal>
  );
}

// ======================================================================
// ربط التلفزيون / المتفرجين / جوال مضيف ثانٍ
// ======================================================================
function PairModal({ open, onClose, origin, sessionId, hostKey }: { open: boolean; onClose: () => void; origin: string; sessionId: string; hostKey: string | null }) {
  const [tab, setTab] = useState<"tv" | "watch" | "host">("tv");
  const url = useMemo(() => {
    if (tab === "tv") return `${origin}/game/${sessionId}/tv`;
    if (tab === "watch") return `${origin}/game/${sessionId}/watch`;
    return `${origin}/game/${sessionId}/host#k=${hostKey ?? ""}`;
  }, [tab, origin, sessionId, hostKey]);
  const [copied, setCopied] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="ربط الشاشات">
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-2xl bg-white/[0.05] p-1 text-sm">
        {([
          ["tv", "📺 التلفزيون"],
          ["watch", "👀 المتفرجين"],
          ["host", "🎮 مضيف ثانٍ"],
        ] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("rounded-xl py-2 font-semibold", tab === k && "bg-gold-400 text-night-950")}>
            {l}
          </button>
        ))}
      </div>
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="rounded-2xl bg-white p-3">{origin ? <QRCodeSVG value={url} size={210} /> : <Loader2 className="animate-spin" />}</div>
        <p className="text-sm text-white/65">
          {tab === "tv" && "افتح هذا الرابط على التلفزيون أو اللابتوب المتصل بالشاشة (لا يحتاج تسجيل دخول)."}
          {tab === "watch" && "رابط للقراءة فقط — أي شخص يمسحه يتابع اللعبة على جواله."}
          {tab === "host" && "⚠️ هذا الرابط يعطي تحكمًا كاملًا باللعبة ويكشف الإجابات. لا تعرضه على الشاشة."}
        </p>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(url).catch(() => undefined);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="w-full truncate rounded-xl bg-white/[0.06] px-3 py-2 text-xs text-white/70"
          dir="ltr"
        >
          {copied ? "✓ تم النسخ" : url}
        </button>
      </div>
    </Modal>
  );
}
