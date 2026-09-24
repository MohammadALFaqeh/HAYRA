"use client";
import { useMemo, useState } from "react";
import { Download, FileUp, Play, Save } from "lucide-react";
import { OPENTDB_CATEGORIES } from "@/lib/importers/opentdb";
import { QURAN_KINDS, type QuranKind } from "@/lib/importers/quran";
import { WIKIDATA_TEMPLATES, type WikidataTemplate } from "@/lib/importers/wikidata";
import type { ImportSource, QuestionDraft } from "@/lib/importers/types";
import { QUESTION_TYPES } from "@/lib/game/constants";
import { Badge, Button, Field, Toggle } from "@/components/ui";
import { cn } from "@/lib/utils";

const FOOTBALL = { PL: "الدوري الإنجليزي", PD: "الدوري الإسباني", SA: "الدوري الإيطالي", BL1: "الدوري الألماني", FL1: "الدوري الفرنسي", CL: "دوري أبطال أوروبا", WC: "كأس العالم" };

const SOURCES: { id: ImportSource; name: string; desc: string }[] = [
  { id: "file", name: "📄 ملف JSON / CSV", desc: "أسئلتك أو باقات إسلامية مراجعة بصيغة حيرة" },
  { id: "quran", name: "📖 القرآن الكريم", desc: "توليد أسئلة من Quran Core Dataset (mjmirza)" },
  { id: "wikidata", name: "🌍 Wikidata", desc: "عواصم، أعلام، عملات — بأسماء عربية" },
  { id: "opentdb", name: "❓ Open Trivia DB", desc: "أسئلة عامة بالإنجليزية تحتاج ترجمة" },
  { id: "tmdb", name: "🎬 TMDB", desc: "بوسترات وسنوات المسلسلات والأفلام العربية (يحتاج مفتاح)" },
  { id: "football", name: "⚽ football-data.org", desc: "أندية، ملاعب، أبطال (يحتاج مفتاح)" },
];

const SAMPLE_CSV =
  "category,subcategory,type,question_text,answer,choices,target,image_url,difficulty,depth_level,explanation,source,reference,tags,family_safe,verified\n" +
  'islamic,seerah,text,في أي عام هاجر النبي ﷺ إلى المدينة؟,العام 13 من البعثة,,3,2,,السيرة النبوية لابن هشام,,سيرة|هجرة,true,false\n' +
  "geography,capitals,multiple_choice,ما عاصمة أستراليا؟,كانبرا,سيدني|ملبورن|كانبرا|بيرث,,,3,2,,,,عواصم,true,false\n";

export default function ImportCenter() {
  const [source, setSource] = useState<ImportSource>("file");
  const [opts, setOpts] = useState<Record<string, unknown>>({ format: "json", category: 9, amount: 20, perKind: 10, template: "capitals", mode: "tv", pages: 2, competition: "PL" });
  const [drafts, setDrafts] = useState<(QuestionDraft & { _on: boolean })[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: string[]; batch: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activate, setActivate] = useState(false);
  const [trustVerified, setTrustVerified] = useState(false);
  const set = (k: string, v: unknown) => setOpts((o) => ({ ...o, [k]: v }));
  const selectedCount = useMemo(() => drafts.filter((d) => d._on).length, [drafts]);

  async function call(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "فشل الطلب");
    return j;
  }

  async function preview() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const j = (await call({ source, mode: "preview", options: opts })) as { drafts: QuestionDraft[]; notes: string[] };
      setDrafts(j.drafts.map((d) => ({ ...d, _on: true })));
      setNotes(j.notes ?? []);
      if (!j.drafts.length) setError("لم يتم العثور على أسئلة");
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const chosen = drafts.filter((d) => d._on).map(({ _on, ...d }) => (void _on, d));
      const j = await call({ source, mode: "save", drafts: chosen, activate, trustVerified });
      setResult(j);
      setDrafts([]);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  const readFile = async (f: File | undefined) => {
    if (!f) return;
    set("content", await f.text());
    set("format", f.name.toLowerCase().endsWith(".csv") ? "csv" : "json");
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-extrabold">مركز الاستيراد</h1>
        <p className="text-white/60">
          البيانات الخارجية تتحول إلى أسئلة حيرة وتُحفظ <b>غير مفعّلة وغير موثّقة</b>. راجعها وعدّلها من بنك الأسئلة (فلتر «دفعة الاستيراد»)، ثم فعّلها.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setSource(s.id);
              setDrafts([]);
              setResult(null);
              setError(null);
            }}
            className={cn("panel p-4 text-right", source === s.id && "border-gold-400 ring-1 ring-gold-400")}
          >
            <div className="font-display text-lg font-bold">{s.name}</div>
            <div className="text-sm text-white/55">{s.desc}</div>
          </button>
        ))}
      </div>

      <section className="panel space-y-4 p-5">
        {source === "file" && (
          <>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-white/[0.08] px-4 py-2.5 font-semibold hover:bg-white/15">
                <FileUp className="h-5 w-5" /> اختر ملف
                <input type="file" accept=".json,.csv,application/json,text/csv" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
              </label>
              <select value={String(opts.format)} onChange={(e) => set("format", e.target.value)}>
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
              </select>
              <a
                className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm text-volt-400 hover:bg-white/[0.05]"
                href={`data:text/csv;charset=utf-8,${encodeURIComponent("\uFEFF" + SAMPLE_CSV)}`}
                download="hayra-template.csv"
              >
                <Download className="h-4 w-4" /> قالب CSV
              </a>
            </div>
            <textarea
              value={String(opts.content ?? "")}
              onChange={(e) => set("content", e.target.value)}
              rows={8}
              className="w-full font-mono text-xs"
              dir="ltr"
              placeholder='[{"category":"islamic","subcategory":"quran","type":"text","question_text":"…","answer":"…","difficulty":2}]'
            />
            <p className="text-xs text-white/45">
              الحقول: category (slug أو اسم عربي)، subcategory، type، question_text، answer، choices (مصفوفة أو مفصولة بـ |)، target (للسؤال الفردي)، clues، difficulty (1–6) أو points (100–600)، depth_level، image_url، audio_url، explanation، source، reference، tags، family_safe، verified، is_active، extra.
            </p>
            <div className="divide-y divide-white/[0.06] rounded-2xl bg-white/[0.03] px-4">
              <Toggle checked={activate} onChange={setActivate} label="تفعيل الأسئلة مباشرة" hint="بدون هذا الخيار تدخل غير مفعّلة للمراجعة" />
              <Toggle checked={trustVerified} onChange={setTrustVerified} label="اعتماد حقل verified من الملف" hint="فقط للباقات التي راجعتها بنفسك" />
            </div>
          </>
        )}

        {source === "quran" && (
          <>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(QURAN_KINDS) as QuranKind[]).map((k) => {
                const kinds = (opts.kinds as QuranKind[] | undefined) ?? [];
                const on = kinds.length === 0 || kinds.includes(k);
                return (
                  <button
                    key={k}
                    onClick={() => {
                      const all = Object.keys(QURAN_KINDS) as QuranKind[];
                      const cur = kinds.length ? kinds : all;
                      set("kinds", on ? cur.filter((x) => x !== k) : [...cur, k]);
                    }}
                    className={cn("rounded-xl px-3 py-2 text-sm", on ? "bg-gold-400 text-night-950" : "bg-white/[0.06]")}
                  >
                    {QURAN_KINDS[k]}
                  </button>
                );
              })}
            </div>
            <Field label="عدد الأسئلة لكل نوع">
              <input type="number" min={1} max={60} value={Number(opts.perKind)} onChange={(e) => set("perKind", Number(e.target.value))} className="w-32" />
            </Field>
            <p className="text-xs text-white/45">المصدر: github.com/mjmirza/quran-dataset (CC BY 4.0). التحميل ~19MB وقد يستغرق نصف دقيقة.</p>
          </>
        )}

        {source === "wikidata" && (
          <div className="flex flex-wrap gap-4">
            <Field label="القالب">
              <select value={String(opts.template)} onChange={(e) => set("template", e.target.value as WikidataTemplate)}>
                {(Object.keys(WIKIDATA_TEMPLATES) as WikidataTemplate[]).map((t) => (
                  <option key={t} value={t}>
                    {WIKIDATA_TEMPLATES[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="العدد">
              <input type="number" min={1} max={200} value={Number(opts.amount)} onChange={(e) => set("amount", Number(e.target.value))} className="w-32" />
            </Field>
          </div>
        )}

        {source === "opentdb" && (
          <div className="flex flex-wrap gap-4">
            <Field label="التصنيف">
              <select value={Number(opts.category)} onChange={(e) => set("category", Number(e.target.value))}>
                {Object.entries(OPENTDB_CATEGORIES).map(([id, c]) => (
                  <option key={id} value={id}>
                    {c.name} → {c.category}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="الصعوبة">
              <select value={String(opts.difficulty ?? "")} onChange={(e) => set("difficulty", e.target.value)}>
                <option value="">الكل</option>
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
              </select>
            </Field>
            <Field label="العدد (حتى 50)">
              <input type="number" min={1} max={50} value={Number(opts.amount)} onChange={(e) => set("amount", Number(e.target.value))} className="w-32" />
            </Field>
          </div>
        )}

        {source === "tmdb" && (
          <div className="flex flex-wrap gap-4">
            <Field label="النوع">
              <select value={String(opts.mode)} onChange={(e) => set("mode", e.target.value)}>
                <option value="tv">مسلسلات</option>
                <option value="movie">أفلام</option>
              </select>
            </Field>
            <Field label="صفحات (20 عنصر لكل صفحة)">
              <input type="number" min={1} max={5} value={Number(opts.pages)} onChange={(e) => set("pages", Number(e.target.value))} className="w-32" />
            </Field>
            <p className="w-full text-xs text-white/45">يحتاج TMDB_API_TOKEN في متغيرات البيئة.</p>
          </div>
        )}

        {source === "football" && (
          <div className="flex flex-wrap gap-4">
            <Field label="البطولة">
              <select value={String(opts.competition)} onChange={(e) => set("competition", e.target.value)}>
                {Object.entries(FOOTBALL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <p className="w-full text-xs text-white/45">يحتاج FOOTBALL_DATA_API_KEY في متغيرات البيئة.</p>
          </div>
        )}

        <Button icon={<Play className="h-5 w-5" />} loading={busy && !drafts.length} onClick={preview} disabled={source === "file" && !opts.content}>
          معاينة
        </Button>
      </section>

      {error && <p className="rounded-xl bg-wine-500/20 px-4 py-3 text-wine-400">{error}</p>}
      {result && (
        <div className="rounded-2xl bg-leaf-500/15 p-4">
          <div className="font-bold text-leaf-400">
            تم حفظ {result.inserted} سؤال {result.skipped > 0 && `(تم تجاهل ${result.skipped} مكرر)`}
          </div>
          <div className="text-sm text-white/60" dir="ltr">
            batch: {result.batch}
          </div>
          <a href={`/admin/questions?batch=${encodeURIComponent(result.batch)}`} className="text-sm text-volt-400 underline">
            مراجعة هذه الدفعة في بنك الأسئلة
          </a>
          {result.errors.length > 0 && (
            <ul className="mt-2 list-disc ps-5 text-sm text-ember-400">
              {result.errors.slice(0, 20).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {drafts.length > 0 && (
        <section className="space-y-3">
          {notes.length > 0 && (
            <ul className="list-disc rounded-2xl bg-ember-500/10 p-4 ps-8 text-sm text-ember-400">
              {notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-white/60">
              {drafts.length} مسودة — محدد {selectedCount}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setDrafts(drafts.map((d) => ({ ...d, _on: true })))}>
              تحديد الكل
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDrafts(drafts.map((d) => ({ ...d, _on: false })))}>
              إلغاء التحديد
            </Button>
            <Button className="ms-auto" icon={<Save className="h-5 w-5" />} loading={busy} disabled={!selectedCount} onClick={save}>
              حفظ {selectedCount} في البنك
            </Button>
          </div>
          <div className="panel max-h-[60vh] overflow-auto">
            <table className="w-full min-w-[760px] text-sm">
              <tbody>
                {drafts.map((d, i) => (
                  <tr key={i} className={cn("border-t border-white/[0.06]", !d._on && "opacity-40")}>
                    <td className="w-10 p-2 text-center">
                      <input type="checkbox" checked={d._on} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, _on: e.target.checked } : x)))} />
                    </td>
                    <td className="p-2">
                      <div className="font-semibold">{d.question_text}</div>
                      {typeof d.extra?.quote === "string" && <div className="quran text-gold-200">﴿ {d.extra.quote} ﴾</div>}
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge>{QUESTION_TYPES[d.type]?.name ?? d.type}</Badge>
                        <Badge>
                          {d.category}
                          {d.subcategory && ` / ${d.subcategory}`}
                        </Badge>
                      </div>
                    </td>
                    <td className="max-w-[220px] p-2 text-leaf-400">{d.answer}</td>
                    <td className="p-2">
                      {d.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={d.image_url} alt="" className="h-12 w-16 rounded object-contain" />
                      )}
                    </td>
                    <td className="p-2">
                      <select
                        value={d.difficulty}
                        onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, difficulty: Number(e.target.value) } : x)))}
                        className="py-1"
                      >
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <option key={n} value={n}>
                            {n * 100}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
