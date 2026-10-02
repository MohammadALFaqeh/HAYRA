// المسار الوحيد المشترك لإدخال المسودات إلى بنك الأسئلة (public.questions)
// مُستخرج كما هو من /api/admin/import — أي تغيير هنا يغيّر سلوك مركز الاستيراد.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeRow } from "@/lib/importers/file";
import type { ImportSource, QuestionDraft } from "@/lib/importers/types";
import type { Category, Subcategory } from "@/lib/db/types";

export const SOURCE_TAG: Record<ImportSource, string> = {
  opentdb: "opentdb",
  quran: "quran-dataset",
  wikidata: "wikidata",
  tmdb: "tmdb",
  football: "football-data",
  file: "file",
};

export interface PromoteOptions {
  source: ImportSource;
  rows: Record<string, unknown>[];
  activate?: boolean;
  trustVerified?: boolean;
  /**
   * نشر من مصنع الأسئلة: import_source الخاص بالمصنع (مثل "factory-wikidata")
   * بدل SOURCE_TAG، والتفعيل حسب activate. التوثيق دائمًا false.
   */
  factory?: { importSource: string; activate: boolean };
}

export interface PromoteResult {
  inserted: number;
  skipped: number;
  errors: string[];
  batch: string;
  /** في وضع المصنع فقط: معرّفات الأسئلة المُدخلة لربطها بالمرشحين */
  rows?: { id: string; external_id: string | null }[];
}

/**
 * يتحقق من المسودات (normalizeRow) ويحوّلها لأسئلة حيرة ويحفظها على دفعات من 200.
 * sb: عميل بجلسة المشرف (يحترم RLS).
 */
export async function promoteToQuestions(sb: SupabaseClient, opts: PromoteOptions): Promise<PromoteResult> {
  const { source, rows } = opts;
  const [{ data: cats }, { data: subs }] = await Promise.all([
    sb.from("categories").select("*"),
    sb.from("subcategories").select("*"),
  ]);
  const categories = (cats ?? []) as Category[];
  const subcategories = (subs ?? []) as Subcategory[];
  const findCat = (v: string) => categories.find((c) => c.slug === v || c.name === v);
  const findSub = (catId: string, v: string | null | undefined) =>
    v ? subcategories.find((s) => s.category_id === catId && (s.slug === v || s.name === v)) ?? null : null;

  const isExternal = source !== "file";
  const tag = opts.factory?.importSource ?? SOURCE_TAG[source];
  const batch = `${tag}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}`;
  const errors: string[] = [];
  const inserts: Record<string, unknown>[] = [];

  rows.forEach((raw, i) => {
    const { draft, error } = normalizeRow(raw, i);
    if (!draft) return void errors.push(error!);
    const d = draft as QuestionDraft;
    const cat = findCat(d.category);
    if (!cat) return void errors.push(`صف ${i + 1}: الفئة «${d.category}» غير موجودة`);
    const sub = findSub(cat.id, d.subcategory);
    if (d.subcategory && !sub) errors.push(`صف ${i + 1}: الفئة الفرعية «${d.subcategory}» غير موجودة — حُفظ بدونها`);
    inserts.push({
      code: d.code ?? null,
      category_id: cat.id,
      subcategory_id: sub?.id ?? null,
      type: d.type,
      question_text: d.question_text,
      answer: d.answer,
      choices: d.choices ?? null,
      clues: d.clues ?? null,
      extra: d.extra ?? {},
      difficulty: d.difficulty,
      depth_level: d.depth_level ?? 2,
      image_url: d.image_url ?? null,
      audio_url: d.audio_url ?? null,
      video_url: d.video_url ?? null,
      explanation: d.explanation ?? null,
      source: d.source ?? null,
      reference: d.reference ?? null,
      tags: d.tags ?? [],
      family_safe: d.family_safe ?? true,
      // المصادر الخارجية: تدخل دائمًا غير مفعّلة وغير موثّقة لتتم مراجعتها
      // (المصنع: التفعيل قراره بعد الفحوص ومراجعة Claude، والتوثيق دائمًا false)
      verified: opts.factory ? false : isExternal ? false : !!opts.trustVerified && !!d.verified,
      is_active: opts.factory ? opts.factory.activate : isExternal ? false : !!opts.activate && d.is_active !== false,
      language: d.language ?? "ar",
      import_source: tag,
      import_batch: batch,
      external_id: d.external_id ?? null,
    });
  });

  let inserted = 0;
  const insertedRows: { id: string; external_id: string | null }[] = [];
  for (let i = 0; i < inserts.length; i += 200) {
    const chunk = inserts.slice(i, i + 200);
    const { data, error } = await sb
      .from("questions")
      .upsert(chunk, { onConflict: "import_source,external_id", ignoreDuplicates: true })
      .select("id,external_id");
    if (error) {
      errors.push(`دفعة ${i / 200 + 1}: ${error.message}`);
      continue;
    }
    inserted += data?.length ?? 0;
    insertedRows.push(...((data ?? []) as { id: string; external_id: string | null }[]));
  }

  const result: PromoteResult = { inserted, skipped: inserts.length - inserted, errors: errors.slice(0, 100), batch };
  if (opts.factory) result.rows = insertedRows;
  return result;
}
