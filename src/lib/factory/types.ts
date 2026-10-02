// أنواع جداول مصنع الأسئلة (supabase/migrations/008_question_factory.sql)
import type { QuestionDraft } from "@/lib/importers/types";

export type GenerationBatchStatus = "pending" | "running" | "completed" | "failed";
export type CandidateStatus = "pending" | "auto_rejected" | "needs_review" | "approved" | "promoted" | "rejected";
export type CandidateCheckStatus = "pass" | "fail" | "warning";

/**
 * حمولة المرشّح = QuestionDraft + import_source الخاص بالمصنع
 * (مثل "factory-wikidata") حتى لا يتنكّر المرشّح كأنه من المستورد القديم.
 */
export type CandidatePayload = QuestionDraft & { import_source: string };

export interface GenerationBatch {
  id: string;
  source: string;
  category_slug: string | null;
  subcategory_slug: string | null;
  status: GenerationBatchStatus;
  requested_count: number | null;
  generated_count: number | null;
  accepted_count: number | null;
  rejected_count: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** حقيقة خام من مصدر خارجي: subject — predicate — object_value */
export interface SourceFact {
  id: string;
  batch_id: string | null;
  provider: string;
  external_id: string;
  subject: string;
  predicate: string;
  object_value: string;
  category_slug: string | null;
  subcategory_slug: string | null;
  source_url: string | null;
  source_name: string | null;
  source_license: string | null;
  raw_payload: Record<string, unknown>;
  retrieved_at: string;
  created_at: string;
}

/** حقيقة قبل حفظها (بدون الحقول التي تولّدها قاعدة البيانات) */
export type SourceFactInput = Omit<SourceFact, "id" | "batch_id" | "created_at">;

export interface QuestionCandidate {
  id: string;
  fact_id: string | null;
  batch_id: string | null;
  status: CandidateStatus;
  /** نفس صيغة الاستيراد الموحدة — تمر لاحقًا عبر promoteToQuestions */
  payload: CandidatePayload;
  /** مفتاح ثابت يمنع إدخال نفس المرشّح مرتين (009) */
  candidate_key: string | null;
  /** ناتج normalizeArabicForComparison — للمقارنة فقط */
  normalized_question_text: string | null;
  normalized_answer: string | null;
  duplicate_score: number | null;
  duplicate_question_id: string | null;
  rejection_reason: string | null;
  /** السؤال الذي نُشر من هذا المرشّح (010) */
  promoted_question_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CandidateCheck {
  id: string;
  candidate_id: string;
  check_name: string;
  status: CandidateCheckStatus;
  score: number | null;
  details: Record<string, unknown>;
  created_at: string;
}
