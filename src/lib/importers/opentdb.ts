// Open Trivia DB — مجاني بدون مفتاح. الأسئلة بالإنجليزية → تُحفظ غير مفعّلة مع وسم «يحتاج ترجمة»
import { fetchJson, seededRandom, shuffleWith, type ImportResult, type QuestionDraft } from "./types";

/** ربط تصنيفات OpenTDB بفئات حيرة */
export const OPENTDB_CATEGORIES: Record<number, { name: string; category: string; subcategory: string | null }> = {
  9: { name: "General Knowledge", category: "general", subcategory: "trivia" },
  11: { name: "Film", category: "drama", subcategory: "movies" },
  14: { name: "Television", category: "drama", subcategory: null },
  17: { name: "Science & Nature", category: "science", subcategory: "general-science" },
  18: { name: "Computers", category: "science", subcategory: "technology" },
  19: { name: "Mathematics", category: "puzzles", subcategory: "math-mind" },
  21: { name: "Sports", category: "sports", subcategory: "general-sports" },
  22: { name: "Geography", category: "geography", subcategory: "countries" },
  23: { name: "History", category: "history", subcategory: "modern-history" },
  27: { name: "Animals", category: "science", subcategory: "animals" },
  28: { name: "Vehicles", category: "brands", subcategory: "cars" },
  31: { name: "Anime & Manga", category: "drama", subcategory: "anime" },
  32: { name: "Cartoons", category: "drama", subcategory: "cartoon" },
};

const DIFF: Record<string, number> = { easy: 2, medium: 3, hard: 5 };

interface OtdbResponse {
  response_code: number;
  results: {
    type: "multiple" | "boolean";
    difficulty: "easy" | "medium" | "hard";
    category: string;
    question: string;
    correct_answer: string;
    incorrect_answers: string[];
  }[];
}

const dec = (s: string) => decodeURIComponent(s);

export async function importOpenTdb(opts: { category: number; amount?: number; difficulty?: string }): Promise<ImportResult> {
  const map = OPENTDB_CATEGORIES[opts.category];
  if (!map) throw new Error("تصنيف OpenTDB غير مدعوم");
  const amount = Math.max(1, Math.min(50, opts.amount ?? 20));
  const params = new URLSearchParams({ amount: String(amount), category: String(opts.category), encode: "url3986" });
  if (opts.difficulty && DIFF[opts.difficulty]) params.set("difficulty", opts.difficulty);

  const data = await fetchJson<OtdbResponse>(`https://opentdb.com/api.php?${params}`);
  if (data.response_code === 5) throw new Error("OpenTDB: طلبات كثيرة، انتظر 5 ثوانٍ وأعد المحاولة");
  if (data.response_code !== 0) throw new Error(`OpenTDB: لا توجد نتائج (code ${data.response_code})`);

  const random = seededRandom(Date.now());
  const drafts: QuestionDraft[] = data.results.map((r) => {
    const question = dec(r.question);
    const answer = dec(r.correct_answer);
    const choices = shuffleWith([answer, ...r.incorrect_answers.map(dec)], random);
    const d = DIFF[r.difficulty] ?? 3;
    return {
      category: map.category,
      subcategory: map.subcategory,
      type: r.type === "boolean" ? "multiple_choice" : "multiple_choice",
      question_text: question,
      answer,
      choices: r.type === "boolean" ? ["True", "False"] : choices,
      difficulty: d,
      depth_level: d <= 2 ? 1 : d <= 3 ? 2 : 3,
      source: "Open Trivia Database (CC BY-SA 4.0)",
      tags: ["opentdb", "يحتاج ترجمة", dec(r.category)],
      language: "en",
      external_id: `otdb:${hash(question + "|" + answer)}`,
    };
  });
  return {
    drafts,
    notes: ["الأسئلة بالإنجليزية: ترجمها وعدّلها من محرر الأسئلة قبل التفعيل (فلتر: وسم «يحتاج ترجمة»)."],
  };
}

/** بصمة قصيرة ثابتة للنص لمنع التكرار عند إعادة الاستيراد */
export function hash(s: string): string {
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
