// الدورة اليومية الكاملة لمصنع الأسئلة، لكل وصفة:
//   1) Wikidata → حقائق → مرشّحون → فحوص ثابتة → كشف تكرار (run-wikidata.ts)
//   2) مراجعة Claude للمرشّحين السليمين وغير المكررين
//   3) نشر الموافَق عليهم مفعّلين في public.questions عبر promoteToQuestions
// قواعد الأمان: لا نشر بدون مراجعة Claude، ولا نشر لمشبوه/مكرر/فاشل في أي فحص ثابت.
// إعادة المحاولة: reviewPendingCandidates يراجع المحجوزين بسبب فشل Claude، بعد إعادة فحص التكرار.
// وضع المراجعة: deterministic (افتراضي، مجاني — review-modes.ts) أو claude (اختياري).
import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { promoteToQuestions } from "@/lib/questions/promote";
import { decideAfterReview, needsAiReview, reviewWithClaude, type ReviewItem } from "./ai/review";
import { mergeBatchMetadata } from "./batches";
import { saveCandidateChecks } from "./candidates";
import type { CheckContext, CheckResult } from "./checks";
import { findDuplicateMatches, pickVerdict, refreshQuestionFingerprints, type DedupeSubject } from "./dedupe";
import { FACTORY_WIKIDATA_SOURCE } from "./generators/wikidata-templates";
import { normalizeArabicForComparison } from "./normalize-ar";
import { dedupeLevelFromChecks, deterministicDecision, type ReviewMode } from "./review-modes";
import { autoPublishPolicyHolds } from "./policy/auto-publish-policy";
import { FactoryRunError, runWikidataFactory, type FactoryRunCounts } from "./run-wikidata";
import type { QuestionCandidate, SourceFact, CandidatePayload } from "./types";

export interface CycleOptions {
  recipeIds: string[];
  perRecipe: number;
  /** deterministic: موافقة آلية ثابتة (بدون Claude). claude: مراجعة Claude */
  mode: ReviewMode;
  /** وضع claude فقط. null = لا يُنشر شيء (يبقى للمراجعة) */
  ai: Anthropic | null;
  autoPublish: boolean;
  log?: (msg: string) => void;
}

/** نتيجة مرحلة المراجعة والنشر لمجموعة مرشحين */
export interface ReviewOutcome {
  aiEligible: number;
  aiReviewed: number;
  aiFailed: number;
  aiRejected: number;
  /** الوضع الثابت: موافَق آليًا / مرفوض آليًا */
  detApproved: number;
  detRejected: number;
  dupRejected: number;
  held: number;
  published: number;
  publishedIds: string[];
  /** خطأ Claude قاتل (رصيد/مفتاح/صلاحية) — يوقف الدورة */
  aiFatal: string | null;
}

export interface RecipeSummary extends ReviewOutcome {
  recipe: string;
  batchId: string | null;
  counts: FactoryRunCounts | null;
  error?: string;
}

type CandidateRow = QuestionCandidate & {
  checks: { check_name: string; status: string; details: Record<string, unknown> | null }[];
  fact: Pick<SourceFact, "subject" | "predicate" | "object_value" | "source_url" | "provider" | "source_name" | "source_license" | "raw_payload"> | null;
};

const CANDIDATE_SELECT =
  "*, checks:candidate_checks(check_name,status,details), fact:source_facts(subject,predicate,object_value,source_url,provider,source_name,source_license,raw_payload)";

const emptyOutcome = (): ReviewOutcome => ({
  aiEligible: 0, aiReviewed: 0, aiFailed: 0, aiRejected: 0, detApproved: 0, detRejected: 0, dupRejected: 0, held: 0, published: 0, publishedIds: [], aiFatal: null,
});

async function loadTaxonomy(sb: SupabaseClient): Promise<Omit<CheckContext, "fact">> {
  const [{ data: cats, error: e1 }, { data: subs, error: e2 }] = await Promise.all([
    sb.from("categories").select("id,slug,name"),
    sb.from("subcategories").select("category_id,slug,name"),
  ]);
  if (e1 || e2) throw new Error(`taxonomy: ${(e1 ?? e2)!.message}`);
  return { categories: cats ?? [], subcategories: subs ?? [] };
}

/** تحديث مشروط: لا يغيّر مرشّحًا تغيّرت حالته منذ تحميله (مثلًا رفضه مشرف أثناء التشغيل) */
async function updateCandidate(sb: SupabaseClient, id: string, fromStatus: string, patch: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await sb.from("question_candidates").update(patch).eq("id", id).eq("status", fromStatus).select("id");
  if (error) throw new Error(`question_candidates/update: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

const subjectOf = (c: QuestionCandidate): DedupeSubject => ({
  type: c.payload.type,
  nq: c.normalized_question_text ?? "",
  na: c.normalized_answer ?? "",
  media: c.payload.image_url ?? c.payload.audio_url ?? c.payload.video_url ?? null,
  reference: c.payload.reference ?? null,
});

/**
 * إعادة فحص التكرار مقابل البنك الحالي (للمراجعة المتأخرة: ربما نُشر شيء مشابه منذ الفحص الأول).
 * المكرر ← auto_rejected، المشبوه ← يبقى محجوزًا، الباقي يكمل.
 */
async function recheckDuplicates(sb: SupabaseClient, rows: CandidateRow[], out: ReviewOutcome): Promise<CandidateRow[]> {
  if (!rows.length) return rows;
  await refreshQuestionFingerprints(sb);
  const matches = await findDuplicateMatches(sb, rows.map((r) => r.id));
  const keep: CandidateRow[] = [];
  const checkRows: { candidateId: string; result: CheckResult }[] = [];
  for (const c of rows) {
    const v = pickVerdict(subjectOf(c), matches.get(c.id) ?? []);
    checkRows.push({
      candidateId: c.id,
      result: {
        check_name: "duplicate_recheck",
        status: v.level === "duplicate" ? "fail" : v.level === "suspicious" ? "warning" : "pass",
        score: v.score,
        details: { reason: v.reason, match_source: v.match?.source ?? null, match_id: v.match?.id ?? null },
      },
    });
    if (v.level === "duplicate") {
      out.dupRejected++;
      await updateCandidate(sb, c.id, "needs_review", {
        status: "auto_rejected",
        rejection_reason: `duplicate (recheck): ${v.reason}`,
        duplicate_score: v.score,
        duplicate_question_id: v.match?.source === "question" ? v.match.id : null,
      });
    } else if (v.level === "suspicious") {
      out.held++;
    } else keep.push(c);
  }
  await saveCandidateChecks(sb, checkRows);
  return keep;
}

/** مراجعة Claude ثم النشر لمجموعة مرشحين بحالة needs_review */
async function reviewAndPublishRows(
  sb: SupabaseClient,
  rows: CandidateRow[],
  opts: Pick<CycleOptions, "ai" | "autoPublish" | "log">,
  taxonomy: Omit<CheckContext, "fact">,
  out: ReviewOutcome,
): Promise<void> {
  const log = opts.log ?? (() => {});
  const pending = rows.filter((c) => needsAiReview(c.checks));
  out.held += rows.length - pending.length;
  // سياسة النشر تُطبَّق قبل Claude أيضًا: المحجوز بالسياسة لا يُرسل ولا يُنشر
  const policyChecks: { candidateId: string; result: CheckResult }[] = [];
  const eligible = pending.filter((c) => {
    const reasons = autoPublishPolicyHolds(c.fact);
    if (!reasons.length) return true;
    out.held++;
    policyChecks.push({ candidateId: c.id, result: { check_name: "auto_publish_policy", status: "warning", details: { reasons } } });
    return false;
  });
  if (policyChecks.length) await saveCandidateChecks(sb, policyChecks);
  out.aiEligible += eligible.length;
  if (!eligible.length) return;
  if (!opts.ai) {
    out.held += eligible.length;
    return;
  }

  const items: ReviewItem[] = eligible.map((c) => ({ id: c.id, payload: c.payload, fact: c.fact }));
  const run = await reviewWithClaude(opts.ai, items, log);
  out.aiReviewed += run.reviews.size;
  out.aiFailed += run.failed;
  if (run.fatalError) out.aiFatal = run.fatalError;

  const checkRows: { candidateId: string; result: CheckResult }[] = [];
  const toPublish: { candidate: CandidateRow; payload: CandidatePayload }[] = [];
  for (const c of eligible) {
    const decision = decideAfterReview(c.payload, run.reviews.get(c.id), { ...taxonomy, fact: c.fact });
    checkRows.push({ candidateId: c.id, result: decision.check });
    if (decision.action === "reject") {
      out.aiRejected++;
      await updateCandidate(sb, c.id, "needs_review", { status: "auto_rejected", rejection_reason: decision.reason.slice(0, 1000) });
    } else if (decision.action === "hold") {
      out.held++;
    } else if (opts.autoPublish) {
      toPublish.push({ candidate: c, payload: decision.payload });
    } else {
      out.held++;
      await updateCandidate(sb, c.id, "needs_review", {
        status: "approved",
        payload: decision.payload,
        normalized_question_text: normalizeArabicForComparison(decision.payload.question_text),
        normalized_answer: normalizeArabicForComparison(decision.payload.answer),
      });
    }
  }
  await saveCandidateChecks(sb, checkRows);
  await publishApproved(sb, toPublish, out, log);
}

/**
 * النشر عبر promoteToQuestions (وضع المصنع): مفعّل مباشرة، verified=false (اصطلاح المشروع:
 * التوثيق = مراجعة بشرية)، import_source = factory-wikidata، وربط المرشّح بالسؤال.
 */
async function publishApproved(
  sb: SupabaseClient,
  toPublish: { candidate: CandidateRow; payload: CandidatePayload }[],
  out: ReviewOutcome,
  log: (msg: string) => void,
): Promise<void> {
  if (!toPublish.length) return;
  const res = await promoteToQuestions(sb, {
    source: "wikidata",
    rows: toPublish.map((t) => t.payload as unknown as Record<string, unknown>),
    factory: { importSource: FACTORY_WIKIDATA_SOURCE, activate: true },
  });
  if (res.errors.length) log(`promote errors: ${res.errors.slice(0, 5).join(" | ")}`);
  const byExternal = new Map((res.rows ?? []).map((r) => [r.external_id, r.id]));
  for (const t of toPublish) {
    const qid = byExternal.get(t.payload.external_id ?? null);
    const normalized = {
      payload: t.payload,
      normalized_question_text: normalizeArabicForComparison(t.payload.question_text),
      normalized_answer: normalizeArabicForComparison(t.payload.answer),
    };
    if (qid) {
      out.published++;
      out.publishedIds.push(qid);
      await updateCandidate(sb, t.candidate.id, "needs_review", { ...normalized, status: "promoted", promoted_question_id: qid });
    } else {
      // لم يُدخل (موجود مسبقًا بنفس المعرّف أو خطأ) ← موافَق عليه بدون نشر
      out.held++;
      await updateCandidate(sb, t.candidate.id, "needs_review", { ...normalized, status: "approved" });
    }
  }
}

/**
 * المراجعة الثابتة (مجانية) لمرشحي دفعة جديدة: نشر/حجز/رفض حسب review-modes.ts.
 * لا تُستدعى إلا على مرشحين وُلدوا للتو في هذا الوضع — المحجوزون القدامى لا يُلمسون.
 */
async function deterministicReviewAndPublish(
  sb: SupabaseClient,
  rows: CandidateRow[],
  opts: Pick<CycleOptions, "autoPublish" | "log">,
  out: ReviewOutcome,
): Promise<void> {
  const log = opts.log ?? (() => {});
  const checkRows: { candidateId: string; result: CheckResult }[] = [];
  const toPublish: { candidate: CandidateRow; payload: CandidatePayload }[] = [];
  for (const c of rows) {
    const d = deterministicDecision({
      payload: c.payload,
      fact: c.fact,
      checks: c.checks.map((k) => ({ check_name: k.check_name, status: k.status as CheckResult["status"] })),
      dedupe: dedupeLevelFromChecks(c.checks.map((k) => ({ check_name: k.check_name, status: k.status as CheckResult["status"] }))) ?? "suspicious",
    });
    checkRows.push({ candidateId: c.id, result: d.check });
    if (d.action === "reject") {
      out.detRejected++;
      await updateCandidate(sb, c.id, "needs_review", { status: "auto_rejected", rejection_reason: `deterministic: ${d.reasons.join(" | ")}`.slice(0, 1000) });
    } else if (d.action === "hold") {
      out.held++;
    } else {
      out.detApproved++;
      if (opts.autoPublish) toPublish.push({ candidate: c, payload: c.payload });
      else {
        out.held++;
        await updateCandidate(sb, c.id, "needs_review", { status: "approved" });
      }
    }
  }
  await saveCandidateChecks(sb, checkRows);
  await publishApproved(sb, toPublish, out, log);
}

export async function runFactoryCycle(sb: SupabaseClient, opts: CycleOptions): Promise<RecipeSummary[]> {
  const log = opts.log ?? (() => {});
  const taxonomy = await loadTaxonomy(sb);
  const out: RecipeSummary[] = [];
  for (const recipe of opts.recipeIds) {
    const summary: RecipeSummary = { recipe, batchId: null, counts: null, ...emptyOutcome() };
    const started = Date.now();
    try {
      const run = await runWikidataFactory(sb, { recipeId: recipe, limit: opts.perRecipe });
      summary.batchId = run.batch.id;
      summary.counts = run.counts;
      const { data, error } = await sb.from("question_candidates").select(CANDIDATE_SELECT).eq("batch_id", run.batch.id).eq("status", "needs_review");
      if (error) throw new Error(`candidates/load: ${error.message}`);
      if (opts.mode === "deterministic") await deterministicReviewAndPublish(sb, (data ?? []) as CandidateRow[], opts, summary);
      else await reviewAndPublishRows(sb, (data ?? []) as CandidateRow[], opts, taxonomy, summary);
      await mergeBatchMetadata(sb, run.batch.id, {
        review: { mode: opts.mode, approved: summary.detApproved, rejected: summary.detRejected },
        ai: {
          model: opts.mode === "claude" && opts.ai ? "claude-opus-5-5" : null,
          eligible: summary.aiEligible,
          reviewed: summary.aiReviewed,
          failed: summary.aiFailed,
          rejected: summary.aiRejected,
          ...(summary.aiFatal ? { fatal_error: summary.aiFatal } : {}),
        },
        published: summary.published,
        held: summary.held,
      });
    } catch (e) {
      summary.error = e instanceof FactoryRunError ? `${e.stage}: ${(e.cause as Error)?.message ?? e.message}` : (e as Error).message;
      if (e instanceof FactoryRunError) summary.batchId = e.batchId;
    }
    log(
      `[${recipe}] ${summary.error ? "ERROR " + summary.error : "ok"} — candidates ${summary.counts?.candidates ?? 0}, ` +
        `auto-rejected ${summary.counts?.autoRejected ?? 0}, ` +
        (opts.mode === "deterministic" ? `deterministic approved ${summary.detApproved}, rejected ${summary.detRejected}, ` : "") +
        `AI reviewed ${summary.aiReviewed}/${summary.aiEligible} (failed ${summary.aiFailed}), ` +
        `AI rejected ${summary.aiRejected}, held ${summary.held}, published ${summary.published} (${Math.round((Date.now() - started) / 1000)}s)`,
    );
    out.push(summary);
    // خطأ Claude قاتل: لا فائدة من توليد مرشحين جدد سيبقون محجوزين
    if (summary.aiFatal) {
      log(`⛔ توقف: خطأ Claude قاتل — ${summary.aiFatal}`);
      break;
    }
  }
  return out;
}

/**
 * إعادة المراجعة: المرشحون needs_review الذين لم يحصلوا على حكم من Claude (فشل سابق).
 * لا يجلب حقائق ولا ينشئ مرشحين جدد. يعيد فحص التكرار أولًا ثم Claude ثم النشر.
 */
export async function reviewPendingCandidates(
  sb: SupabaseClient,
  opts: { ai: Anthropic; autoPublish: boolean; limit: number; batchId?: string; log?: (msg: string) => void },
): Promise<ReviewOutcome & { considered: number }> {
  const out = emptyOutcome();
  let q = sb.from("question_candidates").select(CANDIDATE_SELECT).eq("status", "needs_review").order("created_at", { ascending: true }).limit(1000);
  if (opts.batchId) q = q.eq("batch_id", opts.batchId);
  const { data, error } = await q;
  if (error) throw new Error(`candidates/pending: ${error.message}`);
  const pending = ((data ?? []) as CandidateRow[]).filter((c) => needsAiReview(c.checks)).slice(0, opts.limit);
  if (!pending.length) return { ...out, considered: 0 };

  const taxonomy = await loadTaxonomy(sb);
  const fresh = await recheckDuplicates(sb, pending, out);
  await reviewAndPublishRows(sb, fresh, opts, taxonomy, out);
  for (const batchId of new Set(pending.map((c) => c.batch_id).filter(Boolean) as string[])) {
    await mergeBatchMetadata(sb, batchId, {
      retry: { at: new Date().toISOString(), reviewed: out.aiReviewed, failed: out.aiFailed, published: out.published, ...(out.aiFatal ? { fatal_error: out.aiFatal } : {}) },
    });
  }
  return { ...out, considered: pending.length };
}
