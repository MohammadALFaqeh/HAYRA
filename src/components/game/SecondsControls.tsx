"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Check, Eye, Play, RotateCcw, X } from "lucide-react";
import { useSecondsClock } from "@/lib/client/clock";
import type { useHostSession } from "@/lib/client/use-host-session";
import {
  SECONDS_FLASH_MS,
  SECONDS_LEVEL_IDS,
  SECONDS_LEVELS,
  formatSecondsDiff,
  formatSecondsMs,
  parseSecondsInput,
  randomSecondsTarget,
} from "@/lib/game/seconds";
import type { GameState, SecondsLevel, SecondsRound, TeamId } from "@/lib/game/types";
import { cn, formatPoints, TEAM_COLORS } from "@/lib/utils";
import { Button } from "@/components/ui";

type Act = (a: Parameters<ReturnType<typeof useHostSession>["dispatch"]>[0]) => void;

const other = (t: TeamId): TeamId => (t === "A" ? "B" : "A");

/** زر فتح الفقرة من اللوحة */
export function openSeconds(act: Act, team: TeamId, level: SecondsLevel = 1) {
  act({ type: "SECONDS_OPEN", team, level, points: SECONDS_LEVELS[level].points });
}

/** بدء العد بمدة عشوائية يولّدها جهاز المضيف (نفس القيمة محليًا وعلى السيرفر) */
export function startSeconds(act: Act, level: SecondsLevel) {
  act({ type: "SECONDS_START", targetMs: randomSecondsTarget(level) });
}

/** لوحة تحكم المضيف لفقرة «ملك الثواني» */
export function SecondsControls({ state: s, act }: { state: GameState; act: Act }) {
  const r = s.seconds!;
  const lv = SECONDS_LEVELS[r.level];
  const stopsAt = r.startsAt !== null && r.targetMs !== null ? r.startsAt + r.targetMs : null;
  const clock = useSecondsClock(r.startsAt, stopsAt, SECONDS_FLASH_MS);
  const stopped = clock.phase === "stopped";
  const [peek, setPeek] = useState(false);
  const [guess, setGuess] = useState("");
  const [points, setPoints] = useState(String(r.points));

  useEffect(() => setPeek(false), [r.startsAt]);
  useEffect(() => setGuess(""), [r.answeringTeam, r.startsAt]);
  useEffect(() => setPoints(String(r.points)), [r.points]);

  const guessMs = parseSecondsInput(guess);
  const statusLine: Record<typeof clock.phase, string> = {
    idle: "",
    countdown: `⏳ يبدأ خلال ${clock.countdown}…`,
    flash: "👀 العداد ظاهر الآن",
    hidden: "🤫 العداد مخفي ويعمل",
    stopped: "⏹ توقف العداد — اسأل الفريق",
  };

  return (
    <section className="space-y-3">
      <div className="panel space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-white/10 px-3 py-1 font-bold">👑 ملك الثواني</span>
          <span className="gold-text font-display text-xl font-extrabold">{formatPoints(r.points)}</span>
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs">
            {lv.name} · هامش ±{formatSecondsMs(lv.toleranceMs, 2)} ث · دقة {formatSecondsMs(10 ** (3 - lv.decimals), lv.decimals)} ث
          </span>
        </div>

        {r.stage === "ready" ? (
          <ReadySetup round={r} state={s} act={act} points={points} setPoints={setPoints} />
        ) : (
          <>
            <div className={cn("font-display text-lg font-bold", r.stage !== "done" && TEAM_COLORS[r.answeringTeam].text)}>
              {r.stage === "done"
                ? r.winner
                  ? `✅ ${s.teams[r.winner].name} أصاب (+${formatPoints(r.points)})`
                  : "❌ لم يُصب أحد"
                : r.stage === "missed"
                  ? `❌ ${s.teams[r.pickedBy].name} أخطأ`
                  : `${r.answeringTeam !== r.pickedBy ? "🦊 سرقة: " : "🎯 "}${s.teams[r.answeringTeam].name} — ${statusLine[clock.phase]}`}
            </div>

            {/* الوقت الحقيقي — مخفي افتراضيًا لأن شاشة المضيف قد تكون ظاهرة للجميع */}
            {r.targetMs !== null && (
              <button
                onClick={() => setPeek((v) => !v)}
                className="flex w-full items-center justify-between rounded-2xl border border-leaf-400/40 bg-leaf-500/10 px-4 py-3 text-start"
              >
                <span className="text-xs text-leaf-400">الوقت الحقيقي {r.stage === "done" || peek ? "" : "(اضغط للإظهار)"}</span>
                <span className="font-display text-2xl font-extrabold tabular-nums" dir="ltr">
                  {r.stage === "done" || peek ? formatSecondsMs(r.targetMs, lv.decimals) : "••.•••"}
                </span>
              </button>
            )}

            {r.guesses.length > 0 && (
              <ul className="space-y-1 text-sm">
                {r.guesses.map((g, i) => (
                  <li key={i} className={cn("flex justify-between rounded-xl px-3 py-1.5", g.correct ? "bg-leaf-500/15" : "bg-wine-500/10")}>
                    <span className={TEAM_COLORS[g.team].text}>
                      {g.correct ? "✅" : "❌"} {s.teams[g.team].name}
                    </span>
                    <span dir="ltr" className="tabular-nums">
                      {formatSecondsMs(g.guessMs, lv.decimals)} ({formatSecondsDiff(g.diffMs, lv.decimals)})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {r.stage === "ready" && (
        <Button size="xl" className="w-full" icon={<Play className="h-6 w-6" />} onClick={() => startSeconds(act, r.level)}>
          ابدأ العد ⏱️
        </Button>
      )}

      {r.stage === "running" && (
        <div className="panel space-y-3 p-3">
          <div className="text-sm font-semibold text-white/70">تخمين {s.teams[r.answeringTeam].name} (بالثواني، مثال: {lv.decimals === 1 ? "7.4" : lv.decimals === 2 ? "9.35" : "14.207"})</div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (guessMs !== null && stopped) act({ type: "SECONDS_GUESS", guessMs });
            }}
          >
            <input
              inputMode="decimal"
              dir="ltr"
              placeholder="0.000"
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              className="w-full text-center font-display text-2xl tabular-nums"
              disabled={!stopped}
            />
            <Button type="submit" size="lg" icon={<Check className="h-5 w-5" />} disabled={!stopped || guessMs === null}>
              احكم
            </Button>
          </form>
          {!stopped && <p className="text-xs text-white/45">يتفعّل الإدخال عندما يتوقف العداد.</p>}
          <div className="flex flex-wrap gap-2">
            {r.guesses.length === 0 && (
              <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => startSeconds(act, r.level)}>
                إعادة العد بمدة جديدة
              </Button>
            )}
            <Button size="sm" variant="soft" icon={<Eye className="h-4 w-4" />} disabled={!stopped} onClick={() => act({ type: "SECONDS_REVEAL" })}>
              كشف النتيجة بدون فائز
            </Button>
          </div>
        </div>
      )}

      {r.stage === "missed" && (
        <div className="grid grid-cols-2 gap-2">
          <Button size="xl" variant="volt" icon={<ArrowRight className="h-6 w-6" />} onClick={() => act({ type: "SECONDS_TRANSFER" })}>
            تحويل لـ {s.teams[other(r.pickedBy)].name}
          </Button>
          <Button size="xl" variant="soft" icon={<Eye className="h-6 w-6" />} onClick={() => act({ type: "SECONDS_REVEAL" })}>
            كشف النتيجة
          </Button>
        </div>
      )}

      {r.stage === "done" && (
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" variant="soft" icon={<RotateCcw className="h-5 w-5" />} onClick={() => openSeconds(act, other(r.pickedBy), r.level)}>
            جولة لـ {s.teams[other(r.pickedBy)].name}
          </Button>
          <Button size="lg" onClick={() => act({ type: "SECONDS_CLOSE" })}>
            العودة للوحة ↩
          </Button>
        </div>
      )}

      {r.stage !== "done" && (
        <Button size="sm" variant="ghost" className="w-full" icon={<X className="h-4 w-4" />} onClick={() => act({ type: "SECONDS_CLOSE" })}>
          إلغاء الفقرة والعودة للوحة
        </Button>
      )}
    </section>
  );
}

function ReadySetup({
  round: r,
  state: s,
  act,
  points,
  setPoints,
}: {
  round: SecondsRound;
  state: GameState;
  act: Act;
  points: string;
  setPoints: (v: string) => void;
}) {
  const reopen = (patch: Partial<Pick<SecondsRound, "pickedBy" | "level" | "points">>) =>
    act({
      type: "SECONDS_OPEN",
      team: patch.pickedBy ?? r.pickedBy,
      level: patch.level ?? r.level,
      points: patch.points ?? r.points,
    });
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 text-xs text-white/55">الفريق</div>
        <div className="grid grid-cols-2 gap-2">
          {(["A", "B"] as TeamId[]).map((t) => (
            <button
              key={t}
              onClick={() => t !== r.pickedBy && reopen({ pickedBy: t })}
              className={cn("rounded-xl py-2 font-bold", r.pickedBy === t ? "bg-white/15 ring-2 " + TEAM_COLORS[t].ring : "bg-white/[0.05] text-white/60")}
            >
              <span className={TEAM_COLORS[t].text}>{s.teams[t].name}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs text-white/55">الصعوبة</div>
        <div className="grid grid-cols-3 gap-2">
          {SECONDS_LEVEL_IDS.map((l) => (
            <button
              key={l}
              onClick={() => l !== r.level && reopen({ level: l, points: SECONDS_LEVELS[l].points })}
              className={cn("rounded-xl px-2 py-2 text-sm font-bold", r.level === l ? "bg-gold-400 text-night-950" : "bg-white/[0.05] text-white/70")}
            >
              {SECONDS_LEVELS[l].name}
              <span className="block text-[11px] font-normal opacity-75">±{formatSecondsMs(SECONDS_LEVELS[l].toleranceMs, 2)} ث</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs text-white/55">النقاط</div>
        <div className="flex gap-2">
          <input type="number" inputMode="numeric" min={0} max={5000} value={points} onChange={(e) => setPoints(e.target.value)} className="w-full" />
          <Button
            variant="soft"
            disabled={points === "" || Number(points) === r.points || Number(points) < 0 || Number(points) > 5000}
            onClick={() => reopen({ points: Math.trunc(Number(points)) })}
          >
            تثبيت
          </Button>
        </div>
      </div>
    </div>
  );
}
