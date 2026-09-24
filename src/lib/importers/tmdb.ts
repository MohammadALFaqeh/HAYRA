// TMDB — مسلسلات وأفلام عربية (يتطلب TMDB_API_TOKEN من إعدادات TMDB → API Read Access Token)
import "server-only";
import { depthFor, fetchJson, type ImportResult, type QuestionDraft } from "./types";

export type TmdbMode = "tv" | "movie";
const GULF = new Set(["KW", "SA", "AE", "BH", "QA", "OM"]);
const SRC = "TMDB — This product uses the TMDB API but is not endorsed or certified by TMDB";

interface TmdbItem {
  id: number;
  name?: string;
  title?: string;
  original_name?: string;
  original_title?: string;
  first_air_date?: string;
  release_date?: string;
  poster_path: string | null;
  origin_country?: string[];
  adult?: boolean;
  vote_count: number;
}

function subFor(mode: TmdbMode, countries: string[] = []) {
  if (mode === "movie") return "movies";
  if (countries.includes("SY")) return "syrian-drama";
  if (countries.includes("EG")) return "egyptian-drama";
  if (countries.some((c) => GULF.has(c))) return "gulf-drama";
  return "arabic-series";
}

export async function importTmdb(opts: { mode: TmdbMode; pages?: number }): Promise<ImportResult> {
  const token = process.env.TMDB_API_TOKEN;
  if (!token) throw new Error("أضف TMDB_API_TOKEN في متغيرات البيئة لاستخدام TMDB");
  const pages = Math.max(1, Math.min(5, opts.pages ?? 2));
  const items: TmdbItem[] = [];
  for (let page = 1; page <= pages; page++) {
    const params = new URLSearchParams({
      with_original_language: "ar",
      language: "ar",
      sort_by: "vote_count.desc",
      include_adult: "false",
      page: String(page),
    });
    const data = await fetchJson<{ results: TmdbItem[] }>(`https://api.themoviedb.org/3/discover/${opts.mode}?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    items.push(...data.results);
  }

  const drafts: QuestionDraft[] = [];
  const kindWord = opts.mode === "tv" ? "مسلسل" : "فيلم";
  items.forEach((it, idx) => {
    const name = (it.name ?? it.title ?? "").trim();
    if (!name || it.adult) return;
    const date = it.first_air_date || it.release_date || "";
    const year = date.slice(0, 4);
    const base = idx < 15 ? 2 : idx < 35 ? 3 : idx < 60 ? 4 : 5;
    const sub = subFor(opts.mode, it.origin_country);
    if (it.poster_path) {
      drafts.push({
        category: "drama",
        subcategory: sub,
        type: "identify_image",
        question_text: `ما اسم هذا ال${kindWord}؟`,
        answer: name,
        image_url: `https://image.tmdb.org/t/p/w500${it.poster_path}`,
        difficulty: base,
        depth_level: depthFor(base),
        source: SRC,
        reference: `tmdb:${opts.mode}/${it.id}`,
        tags: ["tmdb", "بوستر"],
        family_safe: false, // راجع البوستر قبل وضعه في الوضع العائلي
        external_id: `${opts.mode}-poster:${it.id}`,
      });
    }
    if (/^\d{4}$/.test(year)) {
      const d = Math.min(6, base + 2);
      drafts.push({
        category: "drama",
        subcategory: sub,
        type: "text",
        question_text: opts.mode === "tv" ? `في أي سنة بدأ عرض مسلسل «${name}»؟` : `في أي سنة صدر فيلم «${name}»؟`,
        answer: year,
        difficulty: d,
        depth_level: depthFor(d),
        source: SRC,
        reference: `tmdb:${opts.mode}/${it.id}`,
        tags: ["tmdb", "سنوات"],
        external_id: `${opts.mode}-year:${it.id}`,
      });
    }
  });
  return {
    drafts,
    notes: ["البوسترات محفوظة كرابط من TMDB. الأسماء كما في TMDB بالعربية وقد تحتاج تصحيح."],
  };
}
