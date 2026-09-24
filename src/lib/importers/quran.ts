// توليد أسئلة قرآنية من Quran Core Dataset (mjmirza) — CC BY 4.0
// الأسئلة البنيوية (السورة/الجزء/عدد الآيات/الترتيب) تُولَّد من البيانات مباشرة وبدقة،
// ومع ذلك تُحفظ «غير مفعّلة» ليراجعها المشرف قبل دخولها اللعب.
import { fetchJson, sampleWith, seededRandom, shuffleWith, type ImportResult, type QuestionDraft } from "./types";

export const QURAN_DATASET_URL = "https://raw.githubusercontent.com/mjmirza/quran-dataset/main/data/quran.json";
const SRC = "Quran Core Dataset (mjmirza) — CC BY 4.0";

interface Ayah {
  number: number;
  verse_key: string;
  text: string;
  counts: { words: number };
}
interface Surah {
  number: number;
  name_arabic: string;
  revelation: { type: string };
  counts: { ayahs: number };
  juz_span: number[];
  ayahs: Ayah[];
}

export type QuranKind = "surah_of" | "complete" | "ayah_count" | "next" | "juz" | "revelation";
export const QURAN_KINDS: Record<QuranKind, string> = {
  surah_of: "في أي سورة وردت الآية؟",
  complete: "أكمل الآية",
  ayah_count: "كم عدد آيات السورة؟",
  next: "السورة التالية في المصحف",
  juz: "في أي جزء تبدأ السورة؟",
  revelation: "مكية أم مدنية (تحتاج مراجعة)",
};

const FIX: Record<string, string> = {
  ابراهيم: "إبراهيم",
  سبإ: "سبأ",
  الانسان: "الإنسان",
  النبإ: "النبأ",
  الإنفطار: "الانفطار",
  الإنشقاق: "الانشقاق",
};

const strip = (t: string) => t.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\s]/g, "");

export async function importQuran(opts: { kinds?: QuranKind[]; perKind?: number; seed?: number }): Promise<ImportResult> {
  const data = await fetchJson<{ surahs: Surah[] }>(QURAN_DATASET_URL, undefined, 55000);
  const SUR = data.surahs.map((s) => ({ ...s, name_arabic: FIX[s.name_arabic] ?? s.name_arabic }));
  const random = seededRandom(opts.seed ?? Date.now());
  const perKind = Math.max(1, Math.min(60, opts.perKind ?? 10));
  const kinds = new Set<QuranKind>(opts.kinds?.length ? opts.kinds : (Object.keys(QURAN_KINDS) as QuranKind[]));

  const cnt = new Map<string, number>();
  for (const s of SUR) for (const a of s.ayahs) cnt.set(strip(a.text), (cnt.get(strip(a.text)) ?? 0) + 1);
  // نتجنب الآية الأولى (قد تحتوي البسملة مدمجة) والآيات المكررة في المصحف
  const uniqueAyahs = (s: Surah, lo = 6, hi = 22) =>
    s.ayahs.filter((a) => a.number > 1 && cnt.get(strip(a.text)) === 1 && a.counts.words >= lo && a.counts.words <= hi);
  const sname = (s: Surah) => "سورة " + s.name_arabic;
  const startJuz = (s: Surah) => s.juz_span[0];

  const drafts: QuestionDraft[] = [];
  const add = (
    d: number,
    depth: number,
    text: string,
    answer: string,
    kind: string,
    key: string | number,
    kw: Partial<QuestionDraft> = {},
  ) =>
    drafts.push({
      category: "islamic",
      subcategory: "quran",
      type: "text",
      question_text: text,
      answer,
      difficulty: d,
      depth_level: depth,
      source: SRC,
      family_safe: true,
      language: "ar",
      external_id: `${kind}:${key}`,
      ...kw,
      tags: ["قرآن", ...(kw.tags ?? [])],
    });

  const juz30 = SUR.filter((s) => startJuz(s) === 30);
  const mid = SUR.filter((s) => startJuz(s) >= 26 && startJuz(s) <= 29);
  const rest = SUR.filter((s) => startJuz(s) < 26);
  const split = (n: number, parts: number) => Math.max(1, Math.round(n / parts));

  // 1) في أي سورة وردت هذه الآية
  if (kinds.has("surah_of")) {
    const run = (pool: Surah[], n: number, d: number, depth: number, mc: boolean) => {
      for (const s of sampleWith(pool, n, random)) {
        const cands = uniqueAyahs(s);
        if (!cands.length) continue;
        const a = cands[Math.floor(random() * cands.length)];
        const kw: Partial<QuestionDraft> = { extra: { quote: a.text }, reference: `${s.name_arabic}: ${a.number}`, tags: ["آيات"] };
        if (mc) {
          const others = sampleWith(pool.filter((x) => x.number !== s.number), 3, random);
          kw.type = "multiple_choice";
          kw.choices = shuffleWith([...others.map(sname), sname(s)], random);
        }
        add(d, depth, "في أي سورة وردت هذه الآية الكريمة؟", sname(s), "surah_of", a.verse_key + (mc ? ":mc" : ""), kw);
      }
    };
    const p = split(perKind, 5);
    run(juz30, p, 2, 1, true);
    run(juz30, p, 3, 1, false);
    run(mid, p, 4, 2, true);
    run(mid, p, 5, 3, false);
    run(rest, p, 6, 3, false);
  }

  // 2) أكمل الآية
  if (kinds.has("complete")) {
    const run = (pool: Surah[], n: number, d: number, depth: number) => {
      for (const s of sampleWith(pool, n, random)) {
        const cands = uniqueAyahs(s, 8, 20);
        if (!cands.length) continue;
        const a = cands[Math.floor(random() * cands.length)];
        const words = a.text.split(" ");
        const cut = Math.max(3, Math.round(words.length * 0.55));
        add(d, depth, "أكمل الآية الكريمة:", words.slice(cut).join(" "), "complete", a.verse_key, {
          extra: { quote: words.slice(0, cut).join(" ") + " …", answer_is_quote: true },
          reference: `${s.name_arabic}: ${a.number}`,
          tags: ["حفظ"],
        });
      }
    };
    const p = split(perKind, 3);
    run(juz30, p, 3, 2);
    run(mid, p, 5, 3);
    run(rest, p, 6, 3);
  }

  // 3) عدد الآيات
  if (kinds.has("ayah_count")) {
    const famous: Record<number, number> = { 1: 1, 112: 2, 108: 2, 103: 2, 114: 2, 113: 2, 2: 4, 36: 4, 18: 4, 67: 3, 55: 4 };
    const pool = SUR.filter((s) => famous[s.number] || startJuz(s) >= 26);
    for (const s of sampleWith(pool, perKind, random)) {
      const n = s.counts.ayahs;
      const d = famous[s.number] ?? (startJuz(s) === 30 ? 3 : 5);
      add(d, d <= 2 ? 1 : d <= 4 ? 2 : 3, `كم عدد آيات ${sname(s)}؟`, n >= 3 && n <= 10 ? `${n} آيات` : `${n} آية`, "ayah_count", s.number, {
        tags: ["عدد الآيات"],
      });
    }
  }

  // 4) السورة التالية
  if (kinds.has("next")) {
    for (const s of sampleWith(SUR.filter((x) => x.number < 114), perKind, random)) {
      const nx = SUR[s.number];
      const j = startJuz(s);
      const d = j === 30 ? 3 : j >= 20 ? 5 : 6;
      add(d, d === 3 ? 2 : 3, `ما السورة التي تأتي بعد ${sname(s)} مباشرة في ترتيب المصحف؟`, sname(nx), "next", s.number, {
        tags: ["ترتيب السور"],
      });
    }
  }

  // 5) الجزء
  if (kinds.has("juz")) {
    for (const s of sampleWith(SUR.filter((x) => startJuz(x) >= 2 && startJuz(x) <= 29 && x.number !== 2), perKind, random)) {
      const j = startJuz(s);
      add(j >= 26 ? 4 : j >= 15 ? 5 : 6, j >= 26 ? 2 : 3, `في أي جزء من أجزاء القرآن تبدأ ${sname(s)}؟`, `الجزء ${j}`, "juz", s.number, {
        tags: ["أجزاء"],
      });
    }
  }

  // 6) مكية أم مدنية — فيها خلاف في بعض السور → غير موثّقة
  if (kinds.has("revelation")) {
    for (const s of sampleWith(SUR, perKind, random)) {
      const t = s.revelation.type === "Meccan" ? "مكية" : "مدنية";
      add(startJuz(s) >= 28 ? 3 : 4, 2, `هل ${sname(s)} مكية أم مدنية؟`, t, "revelation", s.number, {
        type: "multiple_choice",
        choices: ["مكية", "مدنية"],
        explanation: "حسب التصنيف المعتمد في مصحف المدينة، وفي بعض السور خلاف بين العلماء",
        tags: ["مكي ومدني"],
      });
    }
  }

  return {
    drafts,
    notes: [
      "نص الآيات من المصدر كما هو. راجع الأسئلة ثم فعّلها ووثّقها من بنك الأسئلة.",
      "أسئلة «مكية أم مدنية» فيها خلاف في بعض السور — تحقق منها قبل التوثيق.",
    ],
  };
}
