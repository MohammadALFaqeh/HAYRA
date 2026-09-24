import type { NextRequest } from "next/server";
import { errorJson, json } from "@/lib/http";
import { getAdminUser, getServerSupabase } from "@/lib/supabase/server";
import { importOpenTdb } from "@/lib/importers/opentdb";
import { importQuran, type QuranKind } from "@/lib/importers/quran";
import { importWikidata, type WikidataTemplate } from "@/lib/importers/wikidata";
import { importTmdb, type TmdbMode } from "@/lib/importers/tmdb";
import { importFootball } from "@/lib/importers/football";
import { normalizeRow, parseFileContent } from "@/lib/importers/file";
import type { ImportSource, QuestionDraft } from "@/lib/importers/types";
import type { Category, Subcategory } from "@/lib/db/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SOURCE_TAG: Record<ImportSource, string> = {
  opentdb: "opentdb",
  quran: "quran-dataset",
  wikidata: "wikidata",
  tmdb: "tmdb",
  football: "football-data",
  file: "file",
};

interface Body {
  source?: ImportSource;
  mode?: "preview" | "save";
  options?: Record<string, unknown>;
  drafts?: Record<string, unknown>[];
  activate?: boolean;
  trustVerified?: boolean;
}

async function runImporter(source: ImportSource, o: Record<string, unknown>) {
  switch (source) {
    case "opentdb":
      return importOpenTdb({ category: Number(o.category), amount: Number(o.amount) || 20, difficulty: String(o.difficulty ?? "") });
    case "quran":
      return importQuran({ kinds: (o.kinds as QuranKind[]) ?? [], perKind: Number(o.perKind) || 10 });
    case "wikidata":
      return importWikidata({ template: (o.template as WikidataTemplate) ?? "capitals", amount: Number(o.amount) || 40 });
    case "tmdb":
      return importTmdb({ mode: (o.mode as TmdbMode) === "movie" ? "movie" : "tv", pages: Number(o.pages) || 2 });
    case "football":
      return importFootball({ competition: String(o.competition ?? "PL"), include: (o.include as ("teams" | "winners")[]) ?? [] });
    case "file": {
      const content = String(o.content ?? "");
      if (content.length > 5_000_000) throw new Error("الملف كبير جدًا (الحد 5MB)");
      const { drafts, errors } = parseFileContent(content, o.format === "csv" ? "csv" : "json");
      return { drafts, notes: errors.slice(0, 50) };
    }
    default:
      throw new Error("مصدر غير معروف");
  }
}

export async function POST(req: NextRequest) {
  const user = await getAdminUser();
  if (!user) return errorJson("هذه العملية للمشرفين فقط", 403);

  const body = (await req.json().catch(() => ({}))) as Body;
  const source = body.source;
  if (!source || !(source in SOURCE_TAG)) return errorJson("مصدر غير معروف");

  // ---------------- معاينة: تشغيل المستورد وإرجاع المسودات
  if (body.mode !== "save") {
    try {
      const res = await runImporter(source, body.options ?? {});
      return json({ drafts: res.drafts, notes: res.notes });
    } catch (e) {
      return errorJson((e as Error).message || "فشل الاستيراد", 502);
    }
  }

  // ---------------- حفظ: التحقق من المسودات وتحويلها لأسئلة حيرة
  const rows = Array.isArray(body.drafts) ? body.drafts.slice(0, 2000) : [];
  if (!rows.length) return errorJson("لا توجد أسئلة للحفظ");

  const sb = await getServerSupabase();
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
  const batch = `${SOURCE_TAG[source]}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}`;
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
      verified: isExternal ? false : !!body.trustVerified && !!d.verified,
      is_active: isExternal ? false : !!body.activate && d.is_active !== false,
      language: d.language ?? "ar",
      import_source: SOURCE_TAG[source],
      import_batch: batch,
      external_id: d.external_id ?? null,
    });
  });

  let inserted = 0;
  for (let i = 0; i < inserts.length; i += 200) {
    const chunk = inserts.slice(i, i + 200);
    const { data, error } = await sb
      .from("questions")
      .upsert(chunk, { onConflict: "import_source,external_id", ignoreDuplicates: true })
      .select("id");
    if (error) {
      errors.push(`دفعة ${i / 200 + 1}: ${error.message}`);
      continue;
    }
    inserted += data?.length ?? 0;
  }

  return json({ inserted, skipped: inserts.length - inserted, errors: errors.slice(0, 100), batch });
}
