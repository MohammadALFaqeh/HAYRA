"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Toggle } from "@/components/ui";
import { WizardSteps } from "@/components/site/WizardSteps";
import { createGame, loadDraft, saveDraft, type GameDraft } from "@/lib/client/draft";
import { LEVELS, POWERUPS } from "@/lib/game/constants";
import type { GameSettings, PowerupId } from "@/lib/game/types";
import { cn } from "@/lib/utils";

const QUESTION_TIMES = [30, 45, 60, 90, 120];
const STEAL_TIMES = [0, 10, 15, 20, 30];

export function SettingsStep() {
  const router = useRouter();
  const [draft, setDraft] = useState<GameDraft | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = loadDraft();
    if (!d.teams[0] || !d.teams[1]) router.replace("/play/new");
    else setDraft(d);
  }, [router]);
  if (!draft) return null;

  const s = draft.settings;
  const set = (patch: Partial<GameSettings>) => setDraft({ ...draft, settings: { ...s, ...patch } });
  const togglePowerup = (p: PowerupId) =>
    set({ enabledPowerups: s.enabledPowerups.includes(p) ? s.enabledPowerups.filter((x) => x !== p) : [...s.enabledPowerups, p] });

  async function next() {
    if (!draft) return;
    saveDraft(draft);
    if (!draft.packSlug) return router.push("/play/new/categories");
    setCreating(true);
    setError(null);
    const res = await createGame(draft);
    if ("error" in res) {
      setError(res.error);
      setCreating(false);
    } else router.push(`/game/${res.sessionId}/host`);
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-5 pb-20">
      <WizardSteps step={2} pack={!!draft.packSlug} />
      <h1 className="text-center font-display text-4xl font-extrabold">إعدادات اللعبة</h1>

      <section className="panel space-y-4 p-5">
        <h2 className="font-display text-xl font-bold">المستوى</h2>
        <div className="grid grid-cols-3 gap-2">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              onClick={() => set({ level: l.id })}
              className={cn("rounded-2xl border-2 p-3 text-center", s.level === l.id ? "border-gold-400 bg-gold-400/10" : "border-white/10")}
            >
              <div className="font-display text-lg font-bold">{l.name}</div>
              <div className="text-xs text-white/55">{l.hint}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="panel space-y-4 p-5">
        <h2 className="font-display text-xl font-bold">الوقت</h2>
        <Chooser label="وقت السؤال" values={QUESTION_TIMES} value={s.questionSeconds} onChange={(v) => set({ questionSeconds: v })} unit="ث" />
        <Chooser
          label="وقت السرقة"
          values={STEAL_TIMES}
          value={s.stealSeconds}
          onChange={(v) => set({ stealSeconds: v })}
          unit="ث"
          format={(v) => (v === 0 ? "بدون سرقة" : `${v} ث`)}
        />
        {!draft.packSlug && (
          <Chooser label="عدد الفئات" values={[3, 4, 5, 6, 7, 8]} value={draft.categoryCount} onChange={(v) => setDraft({ ...draft, categoryCount: v, settings: s })} />
        )}
      </section>

      <section className="panel divide-y divide-white/[0.06] px-5 py-2">
        <Toggle checked={s.familyMode} onChange={(v) => set({ familyMode: v })} label="👨‍👩‍👧 الوضع العائلي" hint="أسئلة مناسبة لكل الأعمار فقط" />
        <Toggle checked={s.verifiedOnly} onChange={(v) => set({ verifiedOnly: v })} label="✅ الأسئلة الموثّقة فقط" hint="قد يقلل عدد الأسئلة المتاحة" />
        <Toggle checked={s.streakEnabled} onChange={(v) => set({ streakEnabled: v })} label="🔥 مكافأة السلسلة" hint={`+${s.streakBonus} كل ${s.streakThreshold} إجابات صحيحة متتالية`} />
        <Toggle
          checked={s.mysteryEnabled}
          onChange={(v) => set({ mysteryEnabled: v, mysteryCount: v && s.mysteryCount === 0 ? 2 : s.mysteryCount })}
          label="❓ الخانات الغامضة"
          hint="هدية، دبل، سؤال ذهبي، أو تحدٍّ مفاجئ"
        />
        {s.mysteryEnabled && (
          <div className="py-3">
            <Chooser label="عدد الخانات الغامضة" values={[1, 2, 3, 4]} value={s.mysteryCount} onChange={(v) => set({ mysteryCount: v })} />
          </div>
        )}
        <Toggle checked={s.finalEnabled} onChange={(v) => set({ finalEnabled: v })} label="👑 السؤال النهائي بالرهان" />
        <Toggle checked={s.powerupsEnabled} onChange={(v) => set({ powerupsEnabled: v })} label="⚡ وسائل المساعدة" hint="كل فريق يستخدم كل وسيلة مرة واحدة" />
        {s.powerupsEnabled && (
          <div className="grid grid-cols-2 gap-2 py-3">
            {(Object.keys(POWERUPS) as PowerupId[]).map((p) => (
              <button
                key={p}
                onClick={() => togglePowerup(p)}
                className={cn("rounded-xl border px-3 py-2 text-right text-sm", s.enabledPowerups.includes(p) ? "border-gold-400/60 bg-gold-400/10" : "border-white/10 opacity-60")}
              >
                <div className="font-bold">
                  {POWERUPS[p].icon} {POWERUPS[p].name}
                </div>
                <div className="text-xs text-white/55">{POWERUPS[p].desc}</div>
              </button>
            ))}
          </div>
        )}
      </section>

      {error && <p className="rounded-xl bg-wine-500/20 px-4 py-3 text-wine-400">{error}</p>}
      <div className="flex gap-3">
        <Button variant="soft" size="lg" onClick={() => router.push("/play/new")}>
          رجوع
        </Button>
        <Button size="lg" className="flex-1" loading={creating} onClick={next}>
          {draft.packSlug ? "ابدأ اللعبة 🎬" : "التالي: اختيار الفئات"}
        </Button>
      </div>
    </main>
  );
}

function Chooser({
  label,
  values,
  value,
  onChange,
  unit,
  format,
}: {
  label: string;
  values: number[];
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  format?: (v: number) => string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-white/75">{label}</div>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={cn("min-w-14 rounded-xl px-3 py-2 font-bold", value === v ? "bg-gold-400 text-night-950" : "bg-white/[0.07]")}
          >
            {format ? format(v) : `${v}${unit ? ` ${unit}` : ""}`}
          </button>
        ))}
      </div>
    </div>
  );
}
