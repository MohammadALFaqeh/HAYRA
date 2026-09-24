"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Copy, Plus, Save, Star, Trash2, Upload, X } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { uploadMedia, useTaxonomy } from "@/lib/client/admin-data";
import { DEPTH_LABELS, DIFFICULTY_LABELS, QUESTION_TYPES, QUESTION_TYPE_IDS, isQrType } from "@/lib/game/constants";
import type { QuestionType } from "@/lib/game/types";
import { FEEDBACK_LABELS, type FeedbackRating, type QuestionRow } from "@/lib/db/types";
import { Button, Field, Spinner, Toast, Toggle } from "@/components/ui";
import { cn } from "@/lib/utils";

interface Form {
  category_id: string;
  subcategory_id: string;
  type: QuestionType;
  question_text: string;
  answer: string;
  choices: string[];
  clues: string[];
  difficulty: number;
  depth_level: number;
  image_url: string;
  audio_url: string;
  video_url: string;
  explanation: string;
  source: string;
  reference: string;
  tags: string;
  verified: boolean;
  family_safe: boolean;
  is_active: boolean;
  is_blacklisted: boolean;
  language: string;
  quote: string;
  answer_is_quote: boolean;
  instructions: string;
  forbidden: string;
  hint: string;
  target: string;
}

const EMPTY: Form = {
  category_id: "",
  subcategory_id: "",
  type: "text",
  question_text: "",
  answer: "",
  choices: ["", "", "", ""],
  clues: [],
  difficulty: 3,
  depth_level: 2,
  image_url: "",
  audio_url: "",
  video_url: "",
  explanation: "",
  source: "",
  reference: "",
  tags: "",
  verified: false,
  family_safe: true,
  is_active: true,
  is_blacklisted: false,
  language: "ar",
  quote: "",
  answer_is_quote: false,
  instructions: "",
  forbidden: "",
  hint: "",
  target: "",
};

const IMAGE_TYPES: QuestionType[] = ["image", "logo", "identify_image", "multiple_choice", "reverse_points", "individual", "text", "who_am_i", "qr_drawing", "qr_who_am_i"];
const AUDIO_TYPES: QuestionType[] = ["audio", "qr_sound"];
const CLUE_TYPES: QuestionType[] = ["who_am_i", "qr_who_am_i"];

function fromRow(r: QuestionRow): Form {
  const e = (r.extra ?? {}) as Record<string, unknown>;
  return {
    category_id: r.category_id,
    subcategory_id: r.subcategory_id ?? "",
    type: r.type,
    question_text: r.question_text,
    answer: r.answer,
    choices: r.choices ?? ["", "", "", ""],
    clues: r.clues ?? [],
    difficulty: r.difficulty,
    depth_level: r.depth_level,
    image_url: r.image_url ?? "",
    audio_url: r.audio_url ?? "",
    video_url: r.video_url ?? "",
    explanation: r.explanation ?? "",
    source: r.source ?? "",
    reference: r.reference ?? "",
    tags: (r.tags ?? []).join("، "),
    verified: r.verified,
    family_safe: r.family_safe,
    is_active: r.is_active,
    is_blacklisted: r.is_blacklisted,
    language: r.language,
    quote: String(e.quote ?? ""),
    answer_is_quote: !!e.answer_is_quote,
    instructions: String(e.instructions ?? ""),
    forbidden: Array.isArray(e.forbidden) ? (e.forbidden as string[]).join("، ") : "",
    hint: String(e.hint ?? ""),
    target: String(e.target ?? ""),
  };
}

const splitList = (s: string) =>
  s
    .split(/[,،\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

function toPayload(f: Form) {
  const extra: Record<string, unknown> = {};
  if (f.quote.trim()) extra.quote = f.quote.trim();
  if (f.answer_is_quote) extra.answer_is_quote = true;
  if (f.instructions.trim()) extra.instructions = f.instructions.trim();
  if (splitList(f.forbidden).length) extra.forbidden = splitList(f.forbidden);
  if (f.hint.trim()) extra.hint = f.hint.trim();
  if (f.target.trim()) extra.target = f.target.trim();
  const choices = f.type === "multiple_choice" || f.type === "reverse_points" ? f.choices.map((c) => c.trim()).filter(Boolean) : null;
  const clues = CLUE_TYPES.includes(f.type) ? f.clues.map((c) => c.trim()).filter(Boolean) : null;
  return {
    category_id: f.category_id,
    subcategory_id: f.subcategory_id || null,
    type: f.type,
    question_text: f.question_text.trim(),
    answer: f.type === "reverse_points" ? f.choices.map((c) => c.trim()).filter(Boolean).join(" ← ") : f.answer.trim(),
    choices,
    clues: clues?.length ? clues : null,
    extra,
    difficulty: f.difficulty,
    depth_level: f.depth_level,
    image_url: f.image_url.trim() || null,
    audio_url: f.audio_url.trim() || null,
    video_url: f.video_url.trim() || null,
    explanation: f.explanation.trim() || null,
    source: f.source.trim() || null,
    reference: f.reference.trim() || null,
    tags: splitList(f.tags),
    verified: f.verified,
    family_safe: f.family_safe,
    is_active: f.is_active,
    is_blacklisted: f.is_blacklisted,
    language: f.language || "ar",
  };
}

function validate(f: Form): string | null {
  if (!f.category_id) return "اختر الفئة";
  if (!f.question_text.trim()) return "اكتب نص السؤال";
  if (f.type !== "reverse_points" && !f.answer.trim()) return "اكتب الإجابة";
  if (f.type === "multiple_choice") {
    const ch = f.choices.map((c) => c.trim()).filter(Boolean);
    if (ch.length < 2) return "أضف اختيارين على الأقل";
    if (!ch.includes(f.answer.trim())) return "الإجابة يجب أن تكون أحد الاختيارات (اضغط ⭐ بجانب الصحيح)";
  }
  if (f.type === "reverse_points" && f.choices.map((c) => c.trim()).filter(Boolean).length < 2) return "أضف عنصرين على الأقل بالترتيب من الأعلى للأدنى";
  if (f.type === "reverse_points" && (!f.source.trim() || !f.reference.trim())) return "أسئلة الترتيب تحتاج مصدرًا ومرجعًا واضحين للمصداقية";
  if (f.type === "individual" && !f.target.trim()) return "اكتب اسم الشخص المستهدف في هذا السؤال";
  if (["image", "logo", "identify_image"].includes(f.type) && !f.image_url.trim()) return "هذا النوع يحتاج صورة";
  if (f.type === "audio" && !f.audio_url.trim()) return "هذا النوع يحتاج ملف صوت";
  if (f.type === "video" && !f.video_url.trim()) return "هذا النوع يحتاج فيديو";
  if (CLUE_TYPES.includes(f.type) && f.type === "who_am_i" && f.clues.filter((c) => c.trim()).length < 2) return "أضف تلميحين على الأقل";
  return null;
}

export function QuestionEditor({ id }: { id: string | null }) {
  const router = useRouter();
  const { cats, subs } = useTaxonomy();
  const [form, setForm] = useState<Form>(EMPTY);
  const [row, setRow] = useState<QuestionRow | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "error" | "info" } | null>(null);
  const [feedback, setFeedback] = useState<{ id: number; rating: FeedbackRating; note: string | null; created_at: string }[]>([]);

  useEffect(() => {
    if (!id) return;
    const sb = getBrowserSupabase();
    void Promise.all([
      sb.from("questions").select("*").eq("id", id).maybeSingle(),
      sb.from("question_feedback").select("id,rating,note,created_at").eq("question_id", id).order("created_at", { ascending: false }),
    ]).then(([q, fb]) => {
      if (q.data) {
        setRow(q.data as QuestionRow);
        setForm(fromRow(q.data as QuestionRow));
      }
      setFeedback((fb.data ?? []) as typeof feedback);
      setLoading(false);
    });
  }, [id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save(asCopy = false) {
    const err = validate(form);
    if (err) return setMsg({ text: err, tone: "error" });
    setSaving(true);
    const sb = getBrowserSupabase();
    const payload = toPayload(form);
    const res =
      id && !asCopy
        ? await sb.from("questions").update(payload).eq("id", id).select("id").single()
        : await sb.from("questions").insert(payload).select("id").single();
    setSaving(false);
    if (res.error) return setMsg({ text: res.error.message, tone: "error" });
    setMsg({ text: asCopy ? "تم إنشاء نسخة" : "تم الحفظ ✅", tone: "info" });
    if (!id || asCopy) router.replace(`/admin/questions/${res.data.id}`);
  }

  async function remove() {
    if (!id || !confirm("حذف هذا السؤال نهائيًا؟")) return;
    const { error } = await getBrowserSupabase().from("questions").delete().eq("id", id);
    if (error) return setMsg({ text: error.message, tone: "error" });
    router.replace("/admin/questions");
  }

  async function upload(kind: "image_url" | "audio_url" | "video_url", file: File | undefined) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return setMsg({ text: "الحد الأقصى 20MB", tone: "error" });
    try {
      setMsg({ text: "جارٍ الرفع…", tone: "info" });
      set(kind, await uploadMedia(file));
      setMsg({ text: "تم رفع الملف", tone: "info" });
    } catch (e) {
      setMsg({ text: (e as Error).message, tone: "error" });
    }
  }

  if (loading) return <Spinner label="جارٍ التحميل…" />;
  if (id && !row) return <p>السؤال غير موجود.</p>;

  const t = form.type;
  const qr = isQrType(t);

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-24">
      <div className="flex items-center gap-3">
        <Link href="/admin/questions" className="rounded-full bg-white/[0.07] p-2" aria-label="رجوع">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 font-display text-2xl font-extrabold">{id ? "تعديل سؤال" : "سؤال جديد"}</h1>
        {row?.code && <span className="text-xs text-white/40" dir="ltr">{row.code}</span>}
      </div>

      <section className="panel grid gap-4 p-5 sm:grid-cols-2">
        <Field label="الفئة">
          <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value, subcategory_id: "" })} className="w-full">
            <option value="">— اختر —</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الفئة الفرعية">
          <select value={form.subcategory_id} onChange={(e) => set("subcategory_id", e.target.value)} className="w-full" disabled={!form.category_id}>
            <option value="">— بدون —</option>
            {subs
              .filter((s) => s.category_id === form.category_id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="نوع السؤال" className="sm:col-span-2">
          <select value={t} onChange={(e) => set("type", e.target.value as QuestionType)} className="w-full">
            {QUESTION_TYPE_IDS.map((x) => (
              <option key={x} value={x}>
                {QUESTION_TYPES[x].name}
              </option>
            ))}
          </select>
        </Field>
        <div className="space-y-1.5 sm:col-span-2">
          <span className="text-sm font-semibold text-white/80">الصعوبة والنقاط</span>
          <div className="grid grid-cols-6 gap-1.5">
            {[1, 2, 3, 4, 5, 6].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => set("difficulty", d)}
                className={cn("rounded-xl py-2 text-center", form.difficulty === d ? "bg-gold-400 text-night-950" : "bg-white/[0.06]")}
              >
                <div className="font-display text-lg font-extrabold">{d * 100}</div>
                <div className="text-[10px] opacity-70">{DIFFICULTY_LABELS[d]}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <span className="text-sm font-semibold text-white/80">العمق (يطابق مستوى اللعبة)</span>
          <div className="flex gap-1.5">
            {[1, 2, 3].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => set("depth_level", d)}
                className={cn("flex-1 rounded-xl py-2", form.depth_level === d ? "bg-volt-500" : "bg-white/[0.06]")}
              >
                {DEPTH_LABELS[d]}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="panel space-y-4 p-5">
        <Field label={qr ? "وصف التحدي (يظهر على الشاشة)" : "نص السؤال"}>
          <textarea value={form.question_text} onChange={(e) => set("question_text", e.target.value)} rows={3} className="w-full" />
        </Field>
        {!qr && (
          <Field label="اقتباس / آية (اختياري — يظهر بخط القرآن)">
            <textarea value={form.quote} onChange={(e) => set("quote", e.target.value)} rows={2} className="quran w-full text-lg" />
          </Field>
        )}
        {t !== "reverse_points" && (
          <Field label={qr ? "الكلمة السرية (تظهر على جوال اللاعب فقط)" : "الإجابة"}>
            <input value={form.answer} onChange={(e) => set("answer", e.target.value)} className="w-full" />
          </Field>
        )}
        {!qr && <Toggle checked={form.answer_is_quote} onChange={(v) => set("answer_is_quote", v)} label="الإجابة نص قرآني" hint="تُعرض بخط القرآن" />}

        {t === "multiple_choice" && (
          <div className="space-y-2">
            <span className="text-sm font-semibold text-white/80">الاختيارات (⭐ = الصحيح)</span>
            {form.choices.map((c, i) => (
              <div key={i} className="flex gap-2">
                <button
                  type="button"
                  onClick={() => set("answer", c)}
                  className={cn("rounded-xl px-3", c && c === form.answer ? "bg-gold-400 text-night-950" : "bg-white/[0.06]")}
                  aria-label="الإجابة الصحيحة"
                >
                  <Star className="h-4 w-4" />
                </button>
                <input
                  value={c}
                  onChange={(e) => {
                    const choices = [...form.choices];
                    const wasAnswer = choices[i] === form.answer;
                    choices[i] = e.target.value;
                    setForm({ ...form, choices, answer: wasAnswer ? e.target.value : form.answer });
                  }}
                  className="w-full"
                />
                <button type="button" onClick={() => set("choices", form.choices.filter((_, j) => j !== i))} className="rounded-xl bg-white/[0.06] px-3" aria-label="حذف">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {form.choices.length < 6 && (
              <Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => set("choices", [...form.choices, ""])}>
                اختيار
              </Button>
            )}
          </div>
        )}

        {t === "reverse_points" && (
          <div className="space-y-2">
            <span className="text-sm font-semibold text-white/80">الترتيب من الأعلى للأدنى</span>
            <p className="text-xs text-white/50">الأول يأخذ كامل النقاط، ثم تنخفض النقاط حسب المركز.</p>
            {form.choices.map((c, i) => (
              <div key={i} className="flex gap-2">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold-400 font-display font-extrabold text-night-950">{i + 1}</span>
                <input value={c} onChange={(e) => setForm({ ...form, choices: form.choices.map((x, j) => (j === i ? e.target.value : x)) })} className="w-full" placeholder={`المركز ${i + 1}`} />
                <button type="button" onClick={() => set("choices", form.choices.filter((_, j) => j !== i))} className="rounded-xl bg-white/[0.06] px-3" aria-label="حذف">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {form.choices.length < 10 && <Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => set("choices", [...form.choices, ""])}>مركز جديد</Button>}
          </div>
        )}

        {t === "individual" && (
          <Field label="الشخص المستهدف">
            <input value={form.target} onChange={(e) => set("target", e.target.value)} className="w-full" placeholder="مثال: أحمد" />
          </Field>
        )}

        {CLUE_TYPES.includes(t) && (
          <div className="space-y-2">
            <span className="text-sm font-semibold text-white/80">التلميحات (بالترتيب من الأصعب للأسهل)</span>
            {form.clues.map((c, i) => (
              <div key={i} className="flex gap-2">
                <span className="grid w-8 place-items-center text-white/50">{i + 1}</span>
                <input
                  value={c}
                  onChange={(e) => {
                    const clues = [...form.clues];
                    clues[i] = e.target.value;
                    set("clues", clues);
                  }}
                  className="w-full"
                />
                <button type="button" onClick={() => set("clues", form.clues.filter((_, j) => j !== i))} className="rounded-xl bg-white/[0.06] px-3" aria-label="حذف">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => set("clues", [...form.clues, ""])}>
              تلميح
            </Button>
          </div>
        )}

        {qr && (
          <>
            <Field label="تعليمات للاعب (اختياري)">
              <input value={form.instructions} onChange={(e) => set("instructions", e.target.value)} className="w-full" placeholder="مثال: مثّلها بدون صوت" />
            </Field>
            <Field label="كلمات ممنوعة (افصل بفاصلة)">
              <input value={form.forbidden} onChange={(e) => set("forbidden", e.target.value)} className="w-full" />
            </Field>
          </>
        )}
        <Field label="تلميح للمضيف (اختياري)">
          <input value={form.hint} onChange={(e) => set("hint", e.target.value)} className="w-full" />
        </Field>
      </section>

      <section className="panel space-y-4 p-5">
        <h2 className="font-display text-lg font-bold">الوسائط</h2>
        {(IMAGE_TYPES.includes(t) || form.image_url) && (
          <MediaField label="صورة" value={form.image_url} onChange={(v) => set("image_url", v)} accept="image/*" onFile={(f) => upload("image_url", f)} preview="image" />
        )}
        {(AUDIO_TYPES.includes(t) || form.audio_url) && (
          <MediaField label="صوت" value={form.audio_url} onChange={(v) => set("audio_url", v)} accept="audio/*" onFile={(f) => upload("audio_url", f)} preview="audio" />
        )}
        {(t === "video" || form.video_url) && (
          <MediaField label="فيديو" value={form.video_url} onChange={(v) => set("video_url", v)} accept="video/*" onFile={(f) => upload("video_url", f)} preview="video" />
        )}
        {!IMAGE_TYPES.includes(t) && !AUDIO_TYPES.includes(t) && t !== "video" && !form.image_url && (
          <Button size="sm" variant="soft" onClick={() => set("image_url", " ")}>
            + إضافة صورة
          </Button>
        )}
      </section>

      <section className="panel grid gap-4 p-5 sm:grid-cols-2">
        <Field label="الشرح (يظهر بعد الإجابة)" className="sm:col-span-2">
          <textarea value={form.explanation} onChange={(e) => set("explanation", e.target.value)} rows={2} className="w-full" />
        </Field>
        <Field label="المصدر">
          <input value={form.source} onChange={(e) => set("source", e.target.value)} className="w-full" placeholder="مثال: صحيح البخاري" />
        </Field>
        <Field label="المرجع" hint="رقم الآية / الحديث / الصفحة">
          <input value={form.reference} onChange={(e) => set("reference", e.target.value)} className="w-full" />
        </Field>
        <Field label="الوسوم (Tags)" hint="افصل بفاصلة">
          <input value={form.tags} onChange={(e) => set("tags", e.target.value)} className="w-full" />
        </Field>
        <Field label="اللغة">
          <select value={form.language} onChange={(e) => set("language", e.target.value)} className="w-full">
            <option value="ar">العربية</option>
            <option value="en">English (يحتاج ترجمة)</option>
          </select>
        </Field>
      </section>

      <section className="panel divide-y divide-white/[0.06] px-5 py-2">
        <Toggle checked={form.verified} onChange={(v) => set("verified", v)} label="✅ موثّق" hint="تمت مراجعة الإجابة والمصدر" />
        <Toggle checked={form.family_safe} onChange={(v) => set("family_safe", v)} label="👨‍👩‍👧 آمن للوضع العائلي" />
        <Toggle checked={form.is_active} onChange={(v) => set("is_active", v)} label="مفعّل" hint="يدخل في اختيار أسئلة اللعب" />
        <Toggle checked={form.is_blacklisted} onChange={(v) => set("is_blacklisted", v)} label="🚫 محظور" hint="لا يظهر أبدًا" />
      </section>

      {feedback.length > 0 && (
        <section className="panel space-y-2 p-5">
          <h2 className="font-display text-lg font-bold">تقييمات المضيفين</h2>
          {feedback.map((f) => (
            <div key={f.id} className="flex items-center justify-between text-sm">
              <span>{FEEDBACK_LABELS[f.rating]}</span>
              <span className="text-white/40">{new Date(f.created_at).toLocaleString("ar")}</span>
            </div>
          ))}
        </section>
      )}

      {row && (
        <p className="text-xs text-white/40">
          استُخدم {row.times_used} مرة{row.import_source && ` — مصدر الاستيراد: ${row.import_source}`}
          {row.import_batch && ` (${row.import_batch})`}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-night-950/95 p-3 backdrop-blur lg:right-64">
        <div className="mx-auto flex max-w-3xl gap-2">
          <Button className="flex-1" size="lg" icon={<Save className="h-5 w-5" />} loading={saving} onClick={() => save()}>
            حفظ
          </Button>
          {id && (
            <>
              <Button variant="soft" size="lg" icon={<Copy className="h-5 w-5" />} onClick={() => save(true)}>
                نسخة
              </Button>
              <Button variant="danger" size="lg" icon={<Trash2 className="h-5 w-5" />} onClick={remove} aria-label="حذف" />
            </>
          )}
        </div>
      </div>
      <Toast message={msg?.text ?? null} tone={msg?.tone} onClose={() => setMsg(null)} />
    </div>
  );
}

function MediaField({
  label,
  value,
  onChange,
  accept,
  onFile,
  preview,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  accept: string;
  onFile: (f: File | undefined) => void;
  preview: "image" | "audio" | "video";
}) {
  const v = value.trim();
  return (
    <div className="space-y-2">
      <span className="text-sm font-semibold text-white/80">{label}</span>
      <div className="flex gap-2">
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://… أو ارفع ملفًا" className="w-full" dir="ltr" />
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-white/[0.08] px-3 text-sm font-semibold hover:bg-white/15">
          <Upload className="h-4 w-4" /> رفع
          <input type="file" accept={accept} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {v && (
          <button type="button" onClick={() => onChange("")} className="rounded-xl bg-white/[0.06] px-3" aria-label="إزالة">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {v && preview === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={v} alt="" className="max-h-48 rounded-2xl bg-white/5 object-contain p-1" />
      )}
      {v && preview === "audio" && <audio src={v} controls className="w-full" />}
      {v && preview === "video" && <video src={v} controls className="max-h-56 rounded-2xl" />}
    </div>
  );
}
