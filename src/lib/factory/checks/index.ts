// فحوص آلية ثابتة (بدون LLM) لكل مرشّح — كل فحص يُحفظ كسطر مستقل في candidate_checks.
// fail = رفض آلي، warning = يظهر للمراجع فقط، pass = سليم.
// دوال نقية بدون قاعدة بيانات (مختبرة في scripts/factory-selftest.ts).
import { normalizeRow } from "@/lib/importers/file";
import { normalizeArabicForComparison } from "../normalize-ar";
import type { CandidateCheckStatus, CandidatePayload, SourceFact } from "../types";

export interface CheckResult {
  check_name: string;
  status: CandidateCheckStatus;
  score?: number | null;
  details: Record<string, unknown>;
}

export interface CheckContext {
  fact: Pick<SourceFact, "provider" | "source_name" | "source_url" | "source_license"> | null;
  categories: { id: string; slug: string; name: string }[];
  subcategories: { category_id: string; slug: string; name: string }[];
}

/** الحدود قابلة للضبط لاحقًا */
export const CHECK_THRESHOLDS = {
  /** أقل نسبة حروف عربية بين حروف السؤال (الباقي لاتيني) */
  ARABIC_MIN_QUESTION_RATIO: 0.5,
  /** الإجابات الأقصر من هذا (بدون مسافات) لا تُفحص للتسريب: «ما»، «2»… تظهر في أي نص */
  LEAK_MIN_ANSWER_CHARS: 3,
  /** نسبة كلمات الإجابة الموجودة في السؤال التي تستحق تحذيرًا */
  LEAK_PARTIAL_WARNING_RATIO: 0.5,
} as const;

const ARABIC_LETTER = /[ء-ي]/g;
const LATIN_LETTER = /[A-Za-z]/g;
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

// ---------------------------------------------------------------- A
function schemaValid(payload: CandidatePayload): CheckResult {
  const { error } = normalizeRow(payload as unknown as Record<string, unknown>, 0);
  return error
    ? { check_name: "schema_valid", status: "fail", details: { error: error.replace(/^صف 1: /, "") } }
    : { check_name: "schema_valid", status: "pass", details: {} };
}

// ---------------------------------------------------------------- B
function arabicLanguage(payload: CandidatePayload): CheckResult {
  const q = payload.question_text ?? "";
  const a = payload.answer ?? "";
  const qa = count(q, ARABIC_LETTER);
  const ql = count(q, LATIN_LETTER);
  const aa = count(a, ARABIC_LETTER);
  const al = count(a, LATIN_LETTER);
  const ratio = qa + ql ? qa / (qa + ql) : 0;
  const details = { question_arabic_letters: qa, question_latin_letters: ql, answer_arabic_letters: aa, answer_latin_letters: al, language: payload.language ?? "ar" };

  if ((payload.language ?? "ar") !== "ar") return { check_name: "arabic_language", status: "fail", score: ratio, details: { ...details, reason: "حقل اللغة ليس ar" } };
  if (qa === 0) return { check_name: "arabic_language", status: "fail", score: ratio, details: { ...details, reason: "السؤال بلا حروف عربية" } };
  if (ratio < CHECK_THRESHOLDS.ARABIC_MIN_QUESTION_RATIO)
    return { check_name: "arabic_language", status: "fail", score: ratio, details: { ...details, reason: "أغلب حروف السؤال لاتينية" } };
  // إجابة لاتينية بالكامل: قد تكون اسم علم (BMW) — للمراجع
  if (aa === 0 && al > 0) return { check_name: "arabic_language", status: "warning", score: ratio, details: { ...details, reason: "الإجابة بحروف لاتينية فقط" } };
  return { check_name: "arabic_language", status: "pass", score: ratio, details };
}

// ---------------------------------------------------------------- C
const stripAl = (t: string) => t.replace(/^ال(?=..)/, "");

function answerNotLeaked(payload: CandidatePayload): CheckResult {
  const nq = normalizeArabicForComparison(payload.question_text ?? "");
  const na = normalizeArabicForComparison(payload.answer ?? "");
  if (na.replace(/\s/g, "").length < CHECK_THRESHOLDS.LEAK_MIN_ANSWER_CHARS)
    return { check_name: "answer_not_leaked", status: "pass", details: { skipped: "إجابة قصيرة جدًا للفحص" } };

  if (` ${nq} `.includes(` ${na} `))
    return { check_name: "answer_not_leaked", status: "fail", score: 1, details: { reason: "الإجابة كاملة موجودة في نص السؤال", answer: na } };

  const qTokens = new Set(nq.split(" ").map(stripAl));
  const aTokens = na.split(" ").filter((t) => t.length >= CHECK_THRESHOLDS.LEAK_MIN_ANSWER_CHARS);
  const leaked = aTokens.filter((t) => qTokens.has(stripAl(t)));
  const ratio = aTokens.length ? leaked.length / aTokens.length : 0;
  if (aTokens.length && ratio === 1)
    return { check_name: "answer_not_leaked", status: "fail", score: ratio, details: { reason: "كل كلمات الإجابة موجودة في السؤال", leaked } };
  if (ratio >= CHECK_THRESHOLDS.LEAK_PARTIAL_WARNING_RATIO)
    return { check_name: "answer_not_leaked", status: "warning", score: ratio, details: { reason: "جزء من الإجابة موجود في السؤال", leaked } };
  return { check_name: "answer_not_leaked", status: "pass", score: ratio, details: {} };
}

// ---------------------------------------------------------------- D
function taxonomyValid(payload: CandidatePayload, ctx: CheckContext): CheckResult {
  // نفس منطق promoteToQuestions: slug أو الاسم العربي
  const cat = ctx.categories.find((c) => c.slug === payload.category || c.name === payload.category);
  if (!cat) return { check_name: "taxonomy_valid", status: "fail", details: { reason: "الفئة غير موجودة", category: payload.category } };
  if (payload.subcategory) {
    const sub = ctx.subcategories.find((s) => s.category_id === cat.id && (s.slug === payload.subcategory || s.name === payload.subcategory));
    if (!sub)
      return { check_name: "taxonomy_valid", status: "fail", details: { reason: "الفئة الفرعية غير موجودة ضمن الفئة", category: cat.slug, subcategory: payload.subcategory } };
  }
  return { check_name: "taxonomy_valid", status: "pass", details: { category: cat.slug, subcategory: payload.subcategory ?? null } };
}

// ---------------------------------------------------------------- E
function sourcePresent(payload: CandidatePayload, ctx: CheckContext): CheckResult {
  const missing: string[] = [];
  if (!ctx.fact) missing.push("fact");
  else {
    if (!ctx.fact.provider) missing.push("fact.provider");
    if (!ctx.fact.source_name && !ctx.fact.source_url) missing.push("fact.source_name|source_url");
  }
  if (!payload.source?.trim()) missing.push("payload.source");
  return missing.length
    ? { check_name: "source_present", status: "fail", details: { reason: "مصدر ناقص", missing } }
    : { check_name: "source_present", status: "pass", details: { provider: ctx.fact!.provider, license: ctx.fact!.source_license ?? null } };
}

// ---------------------------------------------------------------- F
/** الأنواع التي تحتاج وسائط (نفس قواعد محرر الأسئلة) */
export const REQUIRED_MEDIA: Partial<Record<CandidatePayload["type"], "image_url" | "audio_url" | "video_url">> = {
  image: "image_url",
  logo: "image_url",
  identify_image: "image_url",
  audio: "audio_url",
  video: "video_url",
};

function requiredMedia(payload: CandidatePayload): CheckResult {
  const field = REQUIRED_MEDIA[payload.type];
  if (!field) return { check_name: "required_media", status: "pass", details: { required: null } };
  return payload[field]?.trim()
    ? { check_name: "required_media", status: "pass", details: { required: field } }
    : { check_name: "required_media", status: "fail", details: { reason: "هذا النوع يحتاج وسائط", required: field } };
}

export function runCandidateChecks(payload: CandidatePayload, ctx: CheckContext): CheckResult[] {
  return [schemaValid(payload), arabicLanguage(payload), answerNotLeaked(payload), taxonomyValid(payload, ctx), sourcePresent(payload, ctx), requiredMedia(payload)];
}

export const hasHardFailure = (results: CheckResult[]) => results.some((r) => r.status === "fail");

/** سبب الرفض المختصر من الفحوص الفاشلة */
export const failureSummary = (results: CheckResult[]) =>
  results
    .filter((r) => r.status === "fail")
    .map((r) => `${r.check_name}: ${String(r.details.reason ?? r.details.error ?? "fail")}`)
    .join(" | ");
