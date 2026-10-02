// تصحيح أسماء Wikidata العربية حسب المعرّف الثابت (QID) — لا حسب النص.
// يُطبَّق قبل توليد السؤال (generators/wikidata-templates.ts) على الموضوع والإجابة.
// قاعدة الإضافة: فقط تصحيحات مؤكدة من تدقيق فعلي — لا تخمين.
// النص الأصلي من المصدر يُحفظ في source_facts كما هو (لا يُعدَّل).

export interface ArabicOverride {
  qid: string;
  /** الاسم العربي المعروض في السؤال/الإجابة */
  canonical: string;
  /** إجابات بديلة مقبولة (تُحفظ في extra.answer_aliases للمضيف) */
  aliases?: string[];
  note: string;
}

export const WIKIDATA_ARABIC_OVERRIDES: readonly ArabicOverride[] = [
  // تدقيق 2026-10-02
  { qid: "Q23800", canonical: "فاليتا", note: "عاصمة مالطا — التسمية العربية في Wikidata «البلد» خاطئة" },
  { qid: "Q437", canonical: "ليوبليانا", aliases: ["لبلانة"], note: "عاصمة سلوفينيا — «لبلانة» تسمية غير شائعة" },
  { qid: "Q384", canonical: "سكوبيه", aliases: ["إسكوبية"], note: "عاصمة مقدونيا الشمالية — «إسكوبية» تسمية غير شائعة" },
  { qid: "Q204656", canonical: "سول", aliases: ["سول بيروفي جديد"], note: "عملة البيرو — الاسم الرسمي «سول» منذ 2015" },
  { qid: "Q39099", canonical: "يوان", aliases: ["رنمينبي"], note: "عملة الصين — «يوان» هو الاسم الشائع" },
];

const BY_QID = new Map(WIKIDATA_ARABIC_OVERRIDES.map((o) => [o.qid, o]));

export const arabicOverrideFor = (qid: unknown): ArabicOverride | null => (typeof qid === "string" ? BY_QID.get(qid) ?? null : null);
