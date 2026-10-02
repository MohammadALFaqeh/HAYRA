// أوضاع المراجعة قبل النشر التلقائي:
//   deterministic (افتراضي، مجاني): موافقة آلية صارمة لحقائق Wikidata المنظّمة الآمنة فقط
//   claude (اختياري): مراجعة Claude (ai/review.ts) — يحتاج ANTHROPIC_API_KEY
// دوال نقية بلا قاعدة بيانات ولا شبكة (مختبرة في scripts/factory-selftest.ts).
import type { CheckResult } from "./checks";
import { autoPublishPolicyHolds } from "./policy/auto-publish-policy";
import { RECIPE_IDS } from "./providers/wikidata-recipes";
import type { CandidatePayload, SourceFact } from "./types";

export type ReviewMode = "deterministic" | "claude";
export const REVIEW_MODES: ReviewMode[] = ["deterministic", "claude"];
export const DEFAULT_REVIEW_MODE: ReviewMode = "deterministic";

/**
 * أنواع الحقائق المسموح نشرها آليًا بدون Claude: إجابة واحدة منظّمة من Wikidata، لا رأي فيها.
 * مستبعد عمدًا: flag (قد تحمل الدولة أكثر من علم تاريخي ولا نتتبع ذلك بعد)،
 * animal_* و heritage_country (تسميات عربية غير موثوقة وصور تحتاج نظرًا)، والكتب/الأشخاص/الدين/السياسة.
 */
export const DETERMINISTIC_ALLOWLIST: readonly string[] = ["capital", "currency", "continent", "official_language", "element_symbol", "atomic_number"];

/** وصفات إجاباتها رموز لاتينية بطبيعتها — تحذير «إجابة لاتينية» مقبول فيها فقط */
const LATIN_ANSWER_OK = new Set(["element_symbol"]);
/** فئات لا تُنشر آليًا أبدًا مهما كان المصدر */
const BLOCKED_CATEGORIES = new Set(["islamic"]);
/** فحوص ثابتة يجب أن تكون pass (لا warning) للموافقة الآلية */
const MUST_PASS = ["schema_valid", "answer_not_leaked", "taxonomy_valid", "source_present", "required_media"];
/** صياغة توحي بأكثر من إجابة: «X (Y)»، «X / Y»، «X أو Y»، «X، Y» */
const MULTI_ANSWER = /[()/،,]|\sأو\s/;

export type DedupeLevelLike = "duplicate" | "suspicious" | "none";

export interface DeterministicInput {
  payload: CandidatePayload;
  fact: Pick<SourceFact, "provider" | "predicate" | "source_license" | "raw_payload"> | null;
  /** نتائج الفحوص الثابتة المحفوظة (candidate_checks) */
  checks: Pick<CheckResult, "check_name" | "status">[];
  dedupe: DedupeLevelLike;
}

export type DeterministicDecision = { action: "publish" | "hold" | "reject"; reasons: string[]; check: CheckResult };

export function dedupeLevelFromChecks(checks: Pick<CheckResult, "check_name" | "status">[]): DedupeLevelLike | null {
  const d = checks.find((c) => c.check_name === "duplicate");
  if (!d) return null;
  return d.status === "fail" ? "duplicate" : d.status === "warning" ? "suspicious" : "none";
}

/**
 * القرار الثابت. الترتيب مهم: الرفض (فشل صريح/تكرار) قبل الحجز، والحجز قبل الموافقة.
 * reject ← auto_rejected، hold ← يبقى needs_review، publish ← يُنشر.
 */
export function deterministicDecision(input: DeterministicInput): DeterministicDecision {
  const { payload: p, fact, checks, dedupe } = input;
  const st = (name: string) => checks.find((c) => c.check_name === name)?.status;
  const make = (action: DeterministicDecision["action"], reasons: string[]): DeterministicDecision => ({
    action,
    reasons,
    check: {
      check_name: "deterministic_review",
      status: action === "publish" ? "pass" : action === "reject" ? "fail" : "warning",
      details: { mode: "deterministic", decision: action, reasons, predicate: fact?.predicate ?? null },
    },
  });

  // 1) رفض: فشل فحص ثابت أو تكرار واضح
  const failed = checks.filter((c) => c.status === "fail").map((c) => c.check_name);
  if (failed.length) return make("reject", failed.map((n) => `فشل الفحص ${n}`));
  if (dedupe === "duplicate") return make("reject", ["مكرر"]);

  // 2) حجز للمراجعة: كل ما ليس آمنًا بشكل مؤكد
  const hold: string[] = [];
  if (dedupe !== "none") hold.push(dedupe === "suspicious" ? "تشابه مشبوه" : "لم يُفحص التكرار");
  if (!fact) hold.push("لا توجد حقيقة مصدر");
  else {
    if (!DETERMINISTIC_ALLOWLIST.includes(fact.predicate)) hold.push(`نوع الحقيقة «${fact.predicate}» غير مسموح للموافقة الآلية`);
    if (fact.provider !== "wikidata") hold.push("المصدر ليس wikidata");
    if (fact.source_license !== "CC0") hold.push("الرخصة ليست CC0");
    if (fact.raw_payload?.value_count !== 1) hold.push("الإجابة ليست قيمة واحدة مؤكدة");
  }
  // سياسة النشر المركزية (كيانات/علاقات محجوزة حسب QID)
  hold.push(...autoPublishPolicyHolds(fact));
  if (BLOCKED_CATEGORIES.has(p.category)) hold.push(`الفئة ${p.category} لا تُنشر آليًا`);
  if ((p.language ?? "ar") !== "ar") hold.push("اللغة ليست ar");
  if (p.family_safe !== true) hold.push("غير مؤكد أنه مناسب للعائلة");
  if (!p.answer?.trim() || MULTI_ANSWER.test(p.answer)) hold.push("صياغة الإجابة توحي بأكثر من إجابة");
  for (const name of MUST_PASS) if (st(name) !== "pass") hold.push(`الفحص ${name} ليس pass (${st(name) ?? "مفقود"})`);
  const arabic = st("arabic_language");
  if (arabic !== "pass" && !(arabic === "warning" && fact && LATIN_ANSWER_OK.has(fact.predicate))) hold.push(`فحص اللغة العربية ليس pass (${arabic ?? "مفقود"})`);

  return hold.length ? make("hold", hold) : make("publish", ["كل شروط الموافقة الآلية متحققة"]);
}

// ------------------------------------------------------------------ إعدادات التشغيل

export interface RunConfigInput {
  env: Record<string, string | undefined>;
  /** --review-mode من سطر الأوامر يتقدم على FACTORY_REVIEW_MODE */
  modeArg?: string;
  /** --recipes (فارغ = الافتراضي حسب الوضع) */
  recipesArg?: string;
}

export type RunConfig = { ok: true; mode: ReviewMode; recipeIds: string[] } | { ok: false; error: string };

/**
 * يحدد الوضع والوصفات ويتحقق من المتطلبات:
 * deterministic: لا يحتاج مفتاح Anthropic، ويقتصر على الوصفات المسموحة فقط.
 * claude: يحتاج ANTHROPIC_API_KEY، ويقبل كل الوصفات.
 */
export function resolveRunConfig(input: RunConfigInput): RunConfig {
  const raw = (input.modeArg ?? input.env.FACTORY_REVIEW_MODE ?? DEFAULT_REVIEW_MODE).trim() || DEFAULT_REVIEW_MODE;
  if (!REVIEW_MODES.includes(raw as ReviewMode)) return { ok: false, error: `FACTORY_REVIEW_MODE غير صالح: ${raw} (المتاح: ${REVIEW_MODES.join("، ")})` };
  const mode = raw as ReviewMode;
  if (mode === "claude" && !input.env.ANTHROPIC_API_KEY) return { ok: false, error: "وضع claude يحتاج ANTHROPIC_API_KEY" };

  const defaults = mode === "deterministic" ? [...DETERMINISTIC_ALLOWLIST] : RECIPE_IDS;
  const recipeIds = input.recipesArg?.trim() ? input.recipesArg.split(",").map((s) => s.trim()).filter(Boolean) : defaults;
  const unknown = recipeIds.filter((r) => !RECIPE_IDS.includes(r));
  if (unknown.length) return { ok: false, error: `وصفات غير معروفة: ${unknown.join("، ")}` };
  if (mode === "deterministic") {
    const blocked = recipeIds.filter((r) => !DETERMINISTIC_ALLOWLIST.includes(r));
    if (blocked.length) return { ok: false, error: `الوضع deterministic يعالج الأنواع المسموحة فقط؛ غير مسموح: ${blocked.join("، ")}` };
  }
  return { ok: true, mode, recipeIds };
}
