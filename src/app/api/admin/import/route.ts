import type { NextRequest } from "next/server";
import { errorJson, json } from "@/lib/http";
import { getAdminUser, getServerSupabase } from "@/lib/supabase/server";
import { importOpenTdb } from "@/lib/importers/opentdb";
import { importQuran, type QuranKind } from "@/lib/importers/quran";
import { importWikidata, type WikidataTemplate } from "@/lib/importers/wikidata";
import { importTmdb, type TmdbMode } from "@/lib/importers/tmdb";
import { importFootball } from "@/lib/importers/football";
import { parseFileContent } from "@/lib/importers/file";
import type { ImportSource } from "@/lib/importers/types";
import { SOURCE_TAG, promoteToQuestions } from "@/lib/questions/promote";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  const result = await promoteToQuestions(sb, { source, rows, activate: body.activate, trustVerified: body.trustVerified });
  return json(result);
}
