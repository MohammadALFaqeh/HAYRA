// تشغيل مصنع Wikidata من البداية للنهاية:
//   دفعة → حقائق → مرشّحون (قوالب) → فحوص → كشف تكرار → حالات → عدادات الدفعة
// ⚠️ لا ينشر أي شيء في public.questions. الموافقة والنشر خطوات بشرية لاحقة.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category, Subcategory } from "@/lib/db/types";
import { createGenerationBatch, setBatchStatus } from "./batches";
import { applyCandidateOutcomes, insertCandidates, saveCandidateChecks, type CandidateOutcome, type NewCandidate } from "./candidates";
import { failureSummary, hasHardFailure, runCandidateChecks, type CheckResult } from "./checks";
import { findDuplicateMatches, pickVerdict, refreshQuestionFingerprints, type DedupeSubject, type DedupeVerdict } from "./dedupe";
import { existingSubjects, saveSourceFacts } from "./facts";
import { generateWikidataCandidate } from "./generators/wikidata-templates";
import { getRecipe, takeNewSubjects } from "./providers/wikidata-recipes";
import type { GenerationBatch, QuestionCandidate } from "./types";

export const WIKIDATA_MAX_LIMIT = 500;

export interface FactoryRunCounts {
  facts: number;
  factsNew: number;
  factsExisting: number;
  candidates: number;
  skippedExisting: number;
  skippedByTemplate: number;
  autoRejected: number;
  needsReview: number;
  duplicates: number;
  suspicious: number;
}

export type FactoryStage =
  | "start" | "fetch_facts" | "save_facts" | "generate" | "save_candidates"
  | "load_taxonomy" | "checks" | "dedupe" | "statuses" | "finalize";

/** خطأ يحمل المرحلة ورقم الدفعة — الرسالة الأصلية للسجلات فقط */
export class FactoryRunError extends Error {
  constructor(public stage: FactoryStage, public batchId: string | null, public cause: unknown) {
    super(`factory failed at ${stage}: ${(cause as Error)?.message ?? String(cause)}`);
  }
}

const subjectOf = (c: QuestionCandidate): DedupeSubject => ({
  type: c.payload.type,
  nq: c.normalized_question_text ?? "",
  na: c.normalized_answer ?? "",
  media: c.payload.image_url ?? c.payload.audio_url ?? c.payload.video_url ?? null,
  reference: c.payload.reference ?? null,
});

function dedupeCheck(v: DedupeVerdict): CheckResult {
  const details = {
    reason: v.reason,
    match_source: v.match?.source ?? null,
    match_id: v.match?.id ?? null,
    question_similarity: v.match?.questionSimilarity ?? null,
    answer_similarity: v.match?.answerSimilarity ?? null,
  };
  return { check_name: "duplicate", status: v.level === "duplicate" ? "fail" : v.level === "suspicious" ? "warning" : "pass", score: v.score, details };
}

/**
 * recipeId: إحدى وصفات providers/wikidata-recipes.ts (capital، flag، animal_image…).
 * limit = عدد المواضيع الجديدة (التي لم تُجلب سابقًا) — كل تشغيل يتقدم في القائمة.
 */
export async function runWikidataFactory(
  sb: SupabaseClient,
  opts: { recipeId: string; limit: number },
): Promise<{ batch: GenerationBatch; counts: FactoryRunCounts }> {
  const cfg = getRecipe(opts.recipeId);
  if (!cfg) throw new FactoryRunError("start", null, new Error(`unknown recipe ${opts.recipeId}`));
  const limit = Math.max(1, Math.min(WIKIDATA_MAX_LIMIT, Math.floor(opts.limit)));
  const counts: FactoryRunCounts = {
    facts: 0, factsNew: 0, factsExisting: 0, candidates: 0, skippedExisting: 0,
    skippedByTemplate: 0, autoRejected: 0, needsReview: 0, duplicates: 0, suspicious: 0,
  };

  let stage: FactoryStage = "start";
  let batch: GenerationBatch;
  try {
    batch = await createGenerationBatch(sb, {
      source: "wikidata",
      categorySlug: cfg.categorySlug,
      subcategorySlug: cfg.subcategorySlug,
      requestedCount: limit,
      metadata: { pipeline: "wikidata-v2", recipe: cfg.id, limit },
    });
  } catch (e) {
    throw new FactoryRunError(stage, null, e);
  }

  const skipped: string[] = [];
  try {
    batch = await setBatchStatus(sb, batch.id, "running");

    // 1) الحقائق
    stage = "fetch_facts";
    const all = await cfg.fetchAll(new Date().toISOString());
    const inputs = takeNewSubjects(all, await existingSubjects(sb, "wikidata", cfg.id), limit);
    stage = "save_facts";
    const saved = await saveSourceFacts(sb, inputs, batch.id);
    counts.facts = saved.facts.length;
    counts.factsNew = saved.inserted;
    counts.factsExisting = saved.existing;

    // 2) المرشّحون من القوالب
    stage = "generate";
    const drafts: NewCandidate[] = [];
    for (const fact of saved.facts) {
      const res = generateWikidataCandidate(fact);
      if ("skip" in res) {
        counts.skippedByTemplate++;
        if (skipped.length < 50) skipped.push(res.skip);
        continue;
      }
      drafts.push({ payload: res.payload, factId: fact.id, batchId: batch.id });
    }
    stage = "save_candidates";
    const { inserted, skippedExisting } = await insertCandidates(sb, drafts);
    counts.candidates = inserted.length;
    counts.skippedExisting = skippedExisting;

    // 3) الفحوص
    stage = "load_taxonomy";
    const [{ data: cats, error: catErr }, { data: subs, error: subErr }] = await Promise.all([
      sb.from("categories").select("id,slug,name"),
      sb.from("subcategories").select("category_id,slug,name"),
    ]);
    if (catErr || subErr) throw new Error(`taxonomy: ${(catErr ?? subErr)!.message}`);
    const factById = new Map(saved.facts.map((f) => [f.id, f]));

    stage = "checks";
    const checksByCandidate = new Map<string, CheckResult[]>();
    for (const c of inserted) {
      checksByCandidate.set(
        c.id,
        runCandidateChecks(c.payload, {
          fact: (c.fact_id && factById.get(c.fact_id)) || null,
          categories: (cats ?? []) as Pick<Category, "id" | "slug" | "name">[],
          subcategories: (subs ?? []) as Pick<Subcategory, "category_id" | "slug" | "name">[],
        }),
      );
    }
    await saveCandidateChecks(sb, [...checksByCandidate].flatMap(([candidateId, rs]) => rs.map((result) => ({ candidateId, result }))));

    // 4) التكرار
    stage = "dedupe";
    await refreshQuestionFingerprints(sb);
    const matches = await findDuplicateMatches(sb, inserted.map((c) => c.id));
    const verdicts = new Map<string, DedupeVerdict>();
    // داخل الدفعة: الدالة في SQL تستبعد نفس الدفعة، فنكشف التطابق التام هنا (الأول يفوز)
    const seen = new Map<string, QuestionCandidate>();
    for (const c of inserted) {
      const s = subjectOf(c);
      let v = pickVerdict(s, matches.get(c.id) ?? []);
      const key = `${s.type}|${s.nq}|${s.na}|${s.media ?? ""}`;
      const first = seen.get(key);
      if (first && v.level !== "duplicate") {
        v = {
          level: "duplicate", score: 1, reason: "مكرر داخل نفس الدفعة",
          match: { ...subjectOf(first), source: "candidate", id: first.id, questionSimilarity: 1, answerSimilarity: 1 },
        };
      } else if (!first) seen.set(key, c);
      verdicts.set(c.id, v);
      if (v.level === "duplicate") counts.duplicates++;
      if (v.level === "suspicious") counts.suspicious++;
    }
    await saveCandidateChecks(sb, inserted.map((c) => ({ candidateId: c.id, result: dedupeCheck(verdicts.get(c.id)!) })));

    // 5) الحالات: أي فشل صريح أو تكرار واضح ← رفض آلي، وإلا ← مراجعة بشرية (لا موافقة آلية أبدًا)
    stage = "statuses";
    const outcomes = inserted.map((c) => {
      const checks = checksByCandidate.get(c.id) ?? [];
      const v = verdicts.get(c.id)!;
      const reasons = [hasHardFailure(checks) ? failureSummary(checks) : "", v.level === "duplicate" ? `duplicate: ${v.reason}` : ""].filter(Boolean);
      const outcome: CandidateOutcome = {
        status: reasons.length ? "auto_rejected" : "needs_review",
        duplicate_score: v.score,
        duplicate_question_id: v.level !== "none" && v.match?.source === "question" ? v.match.id : null,
        rejection_reason: reasons.length ? reasons.join(" | ").slice(0, 1000) : null,
      };
      if (outcome.status === "auto_rejected") counts.autoRejected++;
      else counts.needsReview++;
      return { candidate: c, outcome };
    });
    await applyCandidateOutcomes(sb, outcomes);

    // 6) إغلاق الدفعة
    stage = "finalize";
    batch = await setBatchStatus(sb, batch.id, "completed", {
      counts: { generated_count: counts.candidates, accepted_count: counts.needsReview, rejected_count: counts.autoRejected },
      metadata: { counts, skipped_samples: skipped },
    });
    return { batch, counts };
  } catch (e) {
    // الدفعة تصبح failed مع المرحلة والرسالة — لا ندّعي اكتمالًا جزئيًا
    try {
      await setBatchStatus(sb, batch.id, "failed", {
        counts: { generated_count: counts.candidates },
        metadata: { error: { stage, message: (e as Error)?.message ?? String(e), at: new Date().toISOString() }, counts, skipped_samples: skipped },
      });
    } catch (inner) {
      console.error("[factory] failed to mark batch as failed", batch.id, inner);
    }
    throw new FactoryRunError(stage, batch.id, e);
  }
}
