"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dices, X } from "lucide-react";
import { Button, Spinner } from "@/components/ui";
import { WizardSteps } from "@/components/site/WizardSteps";
import { createGame, loadDraft, saveDraft, type GameDraft } from "@/lib/client/draft";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { AvailabilityRow, Category, Subcategory } from "@/lib/db/types";
import { cn, colorOf } from "@/lib/utils";

type Pick = { categoryId: string; subcategoryId: string | null };
const keyOf = (p: Pick) => `${p.categoryId}:${p.subcategoryId ?? "*"}`;

export function CategoriesStep() {
  const router = useRouter();
  const [draft, setDraft] = useState<GameDraft | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [subs, setSubs] = useState<Subcategory[]>([]);
  const [avail, setAvail] = useState<AvailabilityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = loadDraft();
    if (!d.teams[0]) return router.replace("/play/new");
    setDraft(d);
    setPicks(d.columns ?? []);
    const sb = getBrowserSupabase();
    void Promise.all([
      sb.from("categories").select("*").eq("is_active", true).order("sort_order"),
      sb.from("subcategories").select("*").eq("is_active", true).order("sort_order"),
      sb.rpc("question_availability"),
    ]).then(([c, s, a]) => {
      setCats((c.data ?? []) as Category[]);
      setSubs((s.data ?? []) as Subcategory[]);
      setAvail((a.data ?? []) as AvailabilityRow[]);
      setLoading(false);
    });
  }, [router]);

  // عدد الأسئلة المتاحة لكل اختيار حسب الإعدادات
  const countFor = useMemo(() => {
    const fam = draft?.settings.familyMode;
    const ver = draft?.settings.verifiedOnly;
    return (p: Pick) => {
      const rows = avail.filter((r) => r.category_id === p.categoryId && (!p.subcategoryId || r.subcategory_id === p.subcategoryId));
      const n = (r: AvailabilityRow) => Number(ver && fam ? Math.min(r.verified, r.family_safe) : ver ? r.verified : fam ? r.family_safe : r.total);
      const levels = new Set(rows.filter((r) => n(r) > 0).map((r) => r.difficulty)).size;
      return { total: rows.reduce((s, r) => s + n(r), 0), levels };
    };
  }, [avail, draft?.settings.familyMode, draft?.settings.verifiedOnly]);

  if (!draft || loading) {
    return (
      <main className="grid min-h-[60dvh] place-items-center">
        <Spinner label="جارٍ تحميل الفئات…" />
      </main>
    );
  }

  const max = draft.categoryCount;
  const selected = new Set(picks.map(keyOf));
  const toggle = (p: Pick) => {
    const k = keyOf(p);
    if (selected.has(k)) setPicks(picks.filter((x) => keyOf(x) !== k));
    else if (picks.length < max) setPicks([...picks, p]);
  };
  const nameOf = (p: Pick) => {
    const c = cats.find((x) => x.id === p.categoryId);
    const s = subs.find((x) => x.id === p.subcategoryId);
    return { title: s?.name ?? c?.name ?? "", icon: s?.icon ?? c?.icon ?? "❓", color: c?.color };
  };
  const randomFill = () => {
    const options: Pick[] = [];
    for (const c of cats) {
      options.push({ categoryId: c.id, subcategoryId: null });
      for (const s of subs.filter((x) => x.category_id === c.id)) options.push({ categoryId: c.id, subcategoryId: s.id });
    }
    const usedCats = new Set(picks.map((p) => p.categoryId));
    const good = options
      .filter((o) => !selected.has(keyOf(o)) && countFor(o).levels >= 5 && !usedCats.has(o.categoryId))
      .sort(() => Math.random() - 0.5);
    const next = [...picks];
    for (const o of good) {
      if (next.length >= max) break;
      if (next.some((p) => p.categoryId === o.categoryId)) continue;
      next.push(o);
    }
    setPicks(next);
  };

  async function start() {
    if (!draft) return;
    const d = { ...draft, columns: picks };
    saveDraft(d);
    setCreating(true);
    setError(null);
    const res = await createGame(d);
    if ("error" in res) {
      setError(res.error);
      setCreating(false);
    } else router.push(`/game/${res.sessionId}/host`);
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-5 pb-40">
      <WizardSteps step={3} pack={false} />
      <div className="text-center">
        <h1 className="font-display text-4xl font-extrabold">اختاروا {max} فئات</h1>
        <p className="text-white/60">اختاروا الفئة كاملة أو فئة فرعية محددة. كل فئة تصبح عمودًا في اللوحة.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cats.map((c) => {
          const whole = { categoryId: c.id, subcategoryId: null };
          const inCat = picks.filter((p) => p.categoryId === c.id).length;
          const { total } = countFor(whole);
          return (
            <button
              key={c.id}
              onClick={() => setOpenCat(openCat === c.id ? null : c.id)}
              className={cn(
                "relative rounded-tile border-b-4 bg-night-800/80 p-4 text-right transition",
                openCat === c.id && "ring-2 ring-gold-400",
                inCat > 0 && "bg-night-700",
              )}
              style={{ borderColor: colorOf(c.color).hex }}
            >
              <span className="text-3xl">{c.icon}</span>
              <div className="font-display text-lg font-bold">{c.name}</div>
              <div className="text-xs text-white/45">{total} سؤال</div>
              {inCat > 0 && (
                <span className="absolute left-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-gold-400 text-xs font-bold text-night-950">{inCat}</span>
              )}
            </button>
          );
        })}
      </div>

      {openCat && (
        <section className="panel space-y-3 p-4">
          <h2 className="font-display text-xl font-bold">{cats.find((c) => c.id === openCat)?.name}</h2>
          <div className="flex flex-wrap gap-2">
            {[{ categoryId: openCat, subcategoryId: null as string | null }, ...subs.filter((s) => s.category_id === openCat).map((s) => ({ categoryId: openCat, subcategoryId: s.id }))].map((p) => {
              const { total, levels } = countFor(p);
              const on = selected.has(keyOf(p));
              const weak = levels < 6;
              return (
                <button
                  key={keyOf(p)}
                  onClick={() => toggle(p)}
                  disabled={!on && (picks.length >= max || total === 0)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm disabled:opacity-30",
                    on ? "border-gold-400 bg-gold-400 font-bold text-night-950" : "border-white/10 bg-white/[0.05]",
                  )}
                  title={weak ? `متوفر ${levels} من 6 مستويات — بعض الخانات قد تكون فارغة أو بصعوبة قريبة` : undefined}
                >
                  {p.subcategoryId ? `${nameOf(p).icon} ${nameOf(p).title}` : "✨ الفئة كاملة"}
                  <span className={cn("ms-1.5 text-xs", on ? "text-night-950/60" : weak ? "text-ember-400" : "text-white/40")}>{total}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-white/40">الرقم = عدد الأسئلة المتاحة. البرتقالي = لا يغطي كل المستويات (100–600).</p>
        </section>
      )}

      {/* الشريط السفلي */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-night-950/95 p-4 backdrop-blur">
        <div className="mx-auto max-w-5xl space-y-3">
          <div className="flex flex-wrap gap-2">
            {picks.map((p) => {
              const n = nameOf(p);
              return (
                <span key={keyOf(p)} className="inline-flex items-center gap-1 rounded-full bg-white/10 py-1 pe-1 ps-3 text-sm">
                  {n.icon} {n.title}
                  <button onClick={() => toggle(p)} className="rounded-full p-1 hover:bg-white/15" aria-label="إزالة">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              );
            })}
            {picks.length < max && <span className="py-1 text-sm text-white/40">باقي {max - picks.length}</span>}
          </div>
          {error && <p className="text-sm text-wine-400">{error}</p>}
          <div className="flex gap-2">
            <Button variant="soft" onClick={() => router.push("/play/new/settings")}>
              رجوع
            </Button>
            <Button variant="soft" icon={<Dices className="h-5 w-5" />} onClick={randomFill} disabled={picks.length >= max}>
              عشوائي
            </Button>
            <Button className="flex-1" size="lg" disabled={picks.length !== max} loading={creating} onClick={start}>
              ابدأ اللعبة 🎬
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
