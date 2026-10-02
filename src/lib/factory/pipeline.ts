// الدورة اليومية الكاملة لمصنع الأسئلة، لكل وصفة:
//   1) Wikidata → حقائق → مرشّحون → فحوص ثابتة → كشف تكرار (run-wikidata.ts)
//   2) مراجعة Claude للمرشّحين السليمين وغير المكررين
//   3) نشر الموافَق عليهم مفعّلين في public.questions عبر promoteToQuestions
// قواعد الأمان: لا نشر بدون مراجعة Claude، ولا نشر لمشبوه/مكرر/فاشل في أي فحص ثابت.
import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { promoteToQuestions } from "@/lib/questions/promote";
import { decideAfterReview, reviewWithClaude, type ReviewItem } from "./ai/review";
import { mergeBatchMetadata } from "./batches";
import { saveCandidateChecks } from "./candidates";
import type { CheckContext, CheckResult } from "./checks";
import { FACTORY_WIKIDATA_SOURCE } from "./generators/wikidata-templates";
import { normalizeArabicForComparison } from "./normalize-ar";
import { FactoryRunError, runWikidataFactory, type FactoryRunCounts } from "./run-wikidata";
import type { CandidatePayload, QuestionCandidate, SourceFact } from "./types";

export interface CycleOptions {
  recipeIds: string[];
  perRecipe: number;
  /** null = بدون Claude ← لا يُنشر شيء (يبقى للمراجعة) */
  ai: Anthropic | null;
  autoPublish: boolean;
  log?: (msg: string) => void;
}

export interface RecipeSummary {
  recipe: string;
  batchId: string | null;
  counts: FactoryRunCounts | null;
  aiEligible: number;
  aiReviewed: number;
  aiRejected: number;
  held: number;
  published: number;
  error?: string;
}

type CandidateRow = QuestionCandidate & {
  checks: { check_name: string; status: string }[];
  fact: Pick<SourceFact, "subject" | "predicate" | "object_value" | "source_url" | "provider" | "source_name" | "source_license"> | null;
};

async function loadTaxonomy(sb: SupabaseClient): Promise<Omit<CheckContext, "fact">> {
  const [{ data: cats, error: e1 }, { data: subs, error: e2 }] = await Promise.all([
    sb.from("categories").select("id,slug,name"),
    sb.from("subcategories").select("category_id,slug,name"),
  ]);
  if (e1 || e2) throw new Error(`taxonomy: ${(e1 ?? e2)!.message}`);
  return { categories: cats ?? [], subcategories: subs ?? [] };
}

async function updateCandidate(sb: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { error } = await sb.from("question_candidates").update(patch).eq("id", id);
  if (error) throw new Error(`question_candidates/update: ${error.message}`);
}

async function reviewAndPublish(
  sb: SupabaseClient,
  batchId: string,
  opts: CycleOptions,
  taxonomy: Omit<CheckContext, "fact">,
  summary: RecipeSummary,
) {
  const log = opts.log ?? (() => {});
  const { data, error } = await sb
    .from("question_candidates")
    .select("*, checks:candidate_checks(check_name,status), fact:source_facts(subject,predicate,object_value,source_url,provider,source_name,source_license)")
    .eq("batch_id", batchId)
    .eq("status", "needs_review");
  if (error) throw new Error(`candidates/load: ${error.message}`);
  const rows = (data ?? []) as CandidateRow[];

  // فقط: كل الفحوص الثابتة غير فاشلة، والتكرار «pass» (المشبوه يبقى للبشر)
  const eligible = rows.filter((c) => !c.checks.some((k) => k.status === "fail") && c.checks.some((k) => k.check_name === "duplicate" && k.status === "pass"));
  summary.aiEligible = eligible.length;
  summary.held = rows.length - eligible.length;
  if (!eligible.length || !opts.ai) {
    if (!opts.ai) summary.held = rows.length;
    return;
  }

  const items: ReviewItem[] = eligible.map((c) => ({ id: c.id, payload: c.payload, fact: c.fact }));
  const reviews = await reviewWithClaude(opts.ai, items, log);
  summary.aiReviewed = reviews.size;

  const checkRows: { candidateId: string; result: CheckResult }[] = [];
  const toPublish: { candidate: CandidateRow; payload: CandidatePayload }[] = [];
  for (const c of eligible) {
    const decision = decideAfterReview(c.payload, reviews.get(c.id), { ...taxonomy, fact: c.fact });
    checkRows.push({ candidateId: c.id, result: decision.check });
    if (decision.action === "reject") {
      summary.aiRejected++;
      await updateCandidate(sb, c.id, { status: "auto_rejected", rejection_reason: decision.reason.slice(0, 1000) });
    } else if (decision.action === "hold") {
      summary.held++;
    } else if (opts.autoPublish) {
      toPublish.push({ candidate: c, payload: decision.payload });
    } else {
      summary.held++;
      await updateCandidate(sb, c.id, {
        status: "approved",
        payload: decision.payload,
        normalized_question_text: normalizeArabicForComparison(decision.payload.question_text),
        normalized_answer: normalizeArabicForComparison(decision.payload.answer),
      });
    }
  }
  await saveCandidateChecks(sb, checkRows);
  if (!toPublish.length) return;

  // النشر: مفعّل مباشرة، غير موثّق، import_source = factory-wikidata
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
      summary.published++;
      await updateCandidate(sb, t.candidate.id, { ...normalized, status: "promoted", promoted_question_id: qid });
    } else {
      // لم يُدخل (موجود مسبقًا بنفس المعرّف أو خطأ) ← موافَق عليه بدون نشر
      summary.held++;
      await updateCandidate(sb, t.candidate.id, { ...normalized, status: "approved" });
    }
  }
}

export async function runFactoryCycle(sb: SupabaseClient, opts: CycleOptions): Promise<RecipeSummary[]> {
  const log = opts.log ?? (() => {});
  const taxonomy = await loadTaxonomy(sb);
  const out: RecipeSummary[] = [];
  for (const recipe of opts.recipeIds) {
    const summary: RecipeSummary = { recipe, batchId: null, counts: null, aiEligible: 0, aiReviewed: 0, aiRejected: 0, held: 0, published: 0 };
    const started = Date.now();
    try {
      const run = await runWikidataFactory(sb, { recipeId: recipe, limit: opts.perRecipe });
      summary.batchId = run.batch.id;
      summary.counts = run.counts;
      await reviewAndPublish(sb, run.batch.id, opts, taxonomy, summary);
      await mergeBatchMetadata(sb, run.batch.id, {
        ai: { model: opts.ai ? "claude-opus-5-5" : null, eligible: summary.aiEligible, reviewed: summary.aiReviewed, rejected: summary.aiRejected },
        published: summary.published,
        held: summary.held,
      });
    } catch (e) {
      summary.error = e instanceof FactoryRunError ? `${e.stage}: ${(e.cause as Error)?.message ?? e.message}` : (e as Error).message;
      if (e instanceof FactoryRunError) summary.batchId = e.batchId;
    }
    log(
      `[${recipe}] ${summary.error ? "ERROR " + summary.error : "ok"} — candidates ${summary.counts?.candidates ?? 0}, ` +
        `auto-rejected ${summary.counts?.autoRejected ?? 0}, AI reviewed ${summary.aiReviewed}/${summary.aiEligible}, ` +
        `AI rejected ${summary.aiRejected}, held ${summary.held}, published ${summary.published} (${Math.round((Date.now() - started) / 1000)}s)`,
    );
    out.push(summary);
  }
  return out;
}
