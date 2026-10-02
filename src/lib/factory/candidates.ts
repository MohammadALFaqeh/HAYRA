// حفظ المرشّحين ونتائج فحوصهم + عمليات المراجعة (question_candidates / candidate_checks)
// لا شيء هنا يكتب في public.questions.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CheckResult } from "./checks";
import { normalizeArabicForComparison } from "./normalize-ar";
import type { CandidatePayload, CandidateStatus, QuestionCandidate } from "./types";

/** مفتاح ثابت: مصدر المصنع + external_id الحتمي من القالب */
export const candidateKey = (p: CandidatePayload) => `${p.import_source}:${p.external_id}`;

export interface NewCandidate {
  payload: CandidatePayload;
  factId: string | null;
  batchId: string | null;
}

export async function insertCandidates(
  sb: SupabaseClient,
  items: NewCandidate[],
): Promise<{ inserted: QuestionCandidate[]; skippedExisting: number }> {
  const rows = [
    ...new Map(
      items.map((it) => [
        candidateKey(it.payload),
        {
          fact_id: it.factId,
          batch_id: it.batchId,
          status: "pending" as CandidateStatus,
          payload: it.payload,
          candidate_key: candidateKey(it.payload),
          normalized_question_text: normalizeArabicForComparison(it.payload.question_text),
          normalized_answer: normalizeArabicForComparison(it.payload.answer),
        },
      ]),
    ).values(),
  ];
  const inserted: QuestionCandidate[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    // نفس المرشّح من تشغيل سابق ← يُتجاهل (ON CONFLICT DO NOTHING)
    const { data, error } = await sb
      .from("question_candidates")
      .upsert(rows.slice(i, i + 200), { onConflict: "candidate_key", ignoreDuplicates: true })
      .select("*");
    if (error) throw new Error(`question_candidates/insert: ${error.message}`);
    inserted.push(...((data ?? []) as QuestionCandidate[]));
  }
  return { inserted, skippedExisting: items.length - inserted.length };
}

export async function saveCandidateChecks(sb: SupabaseClient, rows: { candidateId: string; result: CheckResult }[]): Promise<void> {
  const payload = rows.map(({ candidateId, result }) => ({
    candidate_id: candidateId,
    check_name: result.check_name,
    status: result.status,
    score: result.score ?? null,
    details: result.details,
  }));
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await sb.from("candidate_checks").insert(payload.slice(i, i + 500));
    if (error) throw new Error(`candidate_checks/insert: ${error.message}`);
  }
}

export interface CandidateOutcome {
  status: Extract<CandidateStatus, "auto_rejected" | "needs_review">;
  duplicate_score: number;
  duplicate_question_id: string | null;
  rejection_reason: string | null;
}

/**
 * يحفظ نتيجة الفحوص والتكرار. يكتب الصف كاملًا (upsert على id) لتقليل عدد الطلبات،
 * ويقتصر على المرشحين الذين ما زالوا pending.
 */
export async function applyCandidateOutcomes(sb: SupabaseClient, items: { candidate: QuestionCandidate; outcome: CandidateOutcome }[]): Promise<void> {
  const rows = items
    .filter(({ candidate }) => candidate.status === "pending")
    .map(({ candidate: c, outcome }) => ({
      id: c.id,
      fact_id: c.fact_id,
      batch_id: c.batch_id,
      payload: c.payload,
      candidate_key: c.candidate_key,
      normalized_question_text: c.normalized_question_text,
      normalized_answer: c.normalized_answer,
      ...outcome,
    }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from("question_candidates").upsert(rows.slice(i, i + 200), { onConflict: "id" });
    if (error) throw new Error(`question_candidates/outcomes: ${error.message}`);
  }
}

// ------------------------------------------------------------------ المراجعة

export const CANDIDATE_STATUSES: CandidateStatus[] = ["pending", "auto_rejected", "needs_review", "approved", "promoted", "rejected"];

export interface CandidateFilters {
  status?: CandidateStatus;
  batchId?: string;
  category?: string;
  subcategory?: string;
  page: number;
  pageSize: number;
}

export async function listCandidates(sb: SupabaseClient, f: CandidateFilters) {
  let q = sb
    .from("question_candidates")
    .select(
      "*, fact:source_facts(*), checks:candidate_checks(id,check_name,status,score,details,created_at), duplicate_question:questions(id,type,question_text,answer,image_url,is_active,verified,import_source,external_id)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(f.page * f.pageSize, f.page * f.pageSize + f.pageSize - 1);
  if (f.status) q = q.eq("status", f.status);
  if (f.batchId) q = q.eq("batch_id", f.batchId);
  if (f.category) q = q.eq("payload->>category", f.category);
  if (f.subcategory) q = q.eq("payload->>subcategory", f.subcategory);
  const { data, count, error } = await q;
  if (error) throw new Error(`question_candidates/list: ${error.message}`);
  return { items: data ?? [], total: count ?? 0 };
}

export type ReviewAction = "approve" | "reject";

/** الحالات التي يُسمح بالانتقال منها لكل إجراء. الموافقة لا تنشر في public.questions. */
export const REVIEW_TRANSITIONS: Record<ReviewAction, { to: CandidateStatus; from: CandidateStatus[] }> = {
  approve: { to: "approved", from: ["needs_review"] },
  // promoted لا يُرفض من هنا (أصبح في البنك)، والمرفوض مسبقًا لا يُعاد رفضه
  reject: { to: "rejected", from: ["pending", "needs_review", "approved", "auto_rejected"] },
};

/** تحديث مشروط ذري: يتغير فقط ما كان في حالة مسموحة. يرجع ما تغيّر وما لم يتغير */
export async function transitionCandidates(sb: SupabaseClient, ids: string[], action: ReviewAction, reason: string | null) {
  const t = REVIEW_TRANSITIONS[action];
  const patch: Record<string, unknown> = { status: t.to };
  if (action === "reject") patch.rejection_reason = reason;
  const { data, error } = await sb.from("question_candidates").update(patch).in("id", ids).in("status", t.from).select("id,status");
  if (error) throw new Error(`question_candidates/transition: ${error.message}`);
  const updated = new Set((data ?? []).map((r: { id: string }) => r.id));
  const notUpdated = ids.filter((id) => !updated.has(id));
  let invalid: { id: string; status: CandidateStatus | null }[] = [];
  if (notUpdated.length) {
    const { data: cur, error: curErr } = await sb.from("question_candidates").select("id,status").in("id", notUpdated);
    if (curErr) throw new Error(`question_candidates/status: ${curErr.message}`);
    const map = new Map((cur ?? []).map((r: { id: string; status: CandidateStatus }) => [r.id, r.status]));
    invalid = notUpdated.map((id) => ({ id, status: map.get(id) ?? null }));
  }
  return { updated: [...updated], invalid };
}
