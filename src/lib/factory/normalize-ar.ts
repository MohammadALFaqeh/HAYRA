// تطبيع النص العربي للمقارنة وكشف التكرار فقط.
// ⚠️ الناتج «مشوّه» عمدًا (ة → ه، حذف التشكيل والترقيم…) — لا يُعرض للمستخدم أبدًا
// ولا يُحفظ مكان النص الأصلي. يُخزَّن فقط في أعمدة normalized_* للمقارنة.
//
// أمثلة (مختبرة في scripts/factory-selftest.ts):
//   "ما عاصِمَةُ الأُرْدُنّ؟"   → "ما عاصمه الاردن"
//   "إِبْرَاهِيمُ — آية «٣»"    → "ابراهيم ايه 3"
//   "سنة ۱۹۹۰"                 → "سنه 1990"
//   "مــدرســة"                → "مدرسه"
//   "Hello, WORLD! 2026"       → "hello world 2026"

// التشكيل (فتحة/ضمة/كسرة/تنوين/شدة/سكون…) + الألف الخنجرية + علامات المصحف
const DIACRITICS = /[ً-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;
// أ إ آ ← ا (ومعها ألف الوصل ٱ لأنها شائعة في نص المصحف)
const ALEF_VARIANTS = /[أإآٱ]/g;
// الأرقام العربية الهندية ٠-٩ والفارسية ۰-۹ ← 0-9
const ARABIC_INDIC_DIGITS = /[٠-٩]/g;
const PERSIAN_DIGITS = /[۰-۹]/g;
// كل ما ليس حرفًا عربيًا أو لاتينيًا أو رقمًا يُعامل كفاصل
const NON_SEMANTIC = /[^ء-يa-z0-9\s]/g;

/** نسخة مطبّعة من النص للمقارنة فقط — لا تعرضها للمستخدم */
export function normalizeArabicForComparison(input: string): string {
  return input
    .normalize("NFKC") // أشكال العرض العربية (ﻻ…) والأرقام كاملة العرض → الأشكال القياسية
    .toLowerCase()
    .replace(DIACRITICS, "")
    .replace(TATWEEL, "")
    .replace(ALEF_VARIANTS, "ا")
    .replace(/ى/g, "ي") // ى ← ي
    .replace(/ة/g, "ه") // ة ← ه (للمقارنة فقط)
    .replace(ARABIC_INDIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(PERSIAN_DIGITS, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(NON_SEMANTIC, " ")
    .replace(/\s+/g, " ")
    .trim();
}
