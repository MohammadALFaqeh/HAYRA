// كشف التكرار v1 (بدون embeddings):
//   الطبقة 1: تطابق تام بعد التطبيع (normalizeArabicForComparison)
//   الطبقة 2: تشابه pg_trgm على نص السؤال والإجابة
// المقارنة ضد public.questions (عبر question_fingerprints) وضد question_candidates.
//
// قاعدة حيرة: أسئلة الوسائط/السياق («لأي دولة هذا العلم؟»، «ما اسم هذا المسلسل؟»…)
// نصها عام ومتكرر عمدًا — لا تُعتبر مكررة لمجرد تطابق النص. هويتها = الإجابة + الوسائط + النوع.
//
// هذا الملف بلا "server-only" عمدًا: الدوال النقية مختبرة في scripts/factory-selftest.ts،
// ودوال قاعدة البيانات تستقبل العميل كمعامل.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isQrType } from "@/lib/game/constants";
import type { QuestionType } from "@/lib/game/types";
import { normalizeArabicForComparison } from "./normalize-ar";

/**
 * الحدود (0..1) — قيم أولية محافظة للضبط لاحقًا بناءً على نتائج المراجعة.
 * المقياس: similarity() في pg_trgm (Jaccard على مجموعات الثلاثيات) — نفس trigramSimilarity أدناه.
 *
 * قياسات فعلية بعد التطبيع (scripts/factory-selftest.ts):
 *   «ما عاصمة الأردن؟» / «ما عاصمه الاردن»                  1.000  (نفس السؤال)
 *   «ما هي عاصمة دولة الأردن؟» / «ما عاصمة الأردن؟»         0.667  (إعادة صياغة)
 *   «ما عاصمة غينيا؟» / «ما عاصمة غينيا بيساو؟»             0.714  (كيان مختلف!)
 *   «ما عاصمة الكويت؟» / «ما عاصمة الكونغو؟»                0.650  (كيان مختلف)
 *   «ما العملة الرسمية في النمسا؟» / «… في إيطاليا؟»        0.613  (كيان مختلف، نفس الإجابة «يورو»)
 *   «ما عاصمة النمسا؟» / «ما عاصمة النرويج؟»                0.571
 *   «ما العملة الرسمية في النمسا؟» / «ما اسم عملة النمسا؟»  0.448  (نفس الحقيقة بصياغة مختلفة)
 * الخلاصة: تبديل الكيان في قالب (0.61–0.71) يتداخل مع إعادة الصياغة (0.67)، لذلك:
 *   - تشابه السؤال وحده لا يكفي أبدًا — الإجابة شرط أساسي.
 *   - إذا كان لكلا الطرفين مرجع كيان (reference) مختلف، لا نطبّق قاعدة «إعادة الصياغة».
 *   - نفس الحقيقة بصياغة بعيدة (0.448) تُلتقط عبر المرجع + الإجابة، لا عبر النص.
 */
export const DEDUPE_THRESHOLDS = {
  /** حد الفلترة الأولية في SQL (عامل %) — أقل من حد «مشبوه» ليصل المرشحون الحدّيون إلى التصنيف */
  PREFILTER_SIMILARITY: 0.45,
  /** عدد المطابقات القصوى لكل فرع بحث لكل مرشّح */
  MATCH_LIMIT: 10,
  /** سؤال نصي + إجابة شبه متطابقين ← مكرر (رفض آلي). 0.9 يسمح بفروق همزة/تاء مربوطة/«ال» فقط */
  TEXT_DUPLICATE_QUESTION: 0.9,
  TEXT_DUPLICATE_ANSWER: 0.9,
  /** إعادة صياغة محتملة بنفس الإجابة تقريبًا ← مراجعة (فقط إن لم يكن الكيانان مختلفين صراحةً) */
  TEXT_SUSPECT_QUESTION: 0.6,
  TEXT_SUSPECT_ANSWER: 0.5,
  /** نفس السؤال تقريبًا بإجابة مختلفة ← تعارض أو تغيّر في الحقيقة ← مراجعة */
  CONFLICT_QUESTION: 0.9,
  CONFLICT_MAX_ANSWER: 0.5,
  /** نفس الكيان المرجعي (wikidata:Q…) بنفس الإجابة ← مراجعة (صياغة مختلفة لنفس الحقيقة) */
  SAME_ENTITY_ANSWER: 0.9,
} as const;

/** أنواع نصها عام والهوية في الوسائط/الإجابة */
const CONTEXT_TYPES = new Set<string>(["identify_image", "image", "logo", "who_am_i", "audio", "video"]);

export interface DedupeSubject {
  type: string;
  /** normalized question text */
  nq: string;
  /** normalized answer */
  na: string;
  media: string | null;
  reference: string | null;
}

export interface DedupeMatch extends DedupeSubject {
  source: "question" | "candidate";
  id: string;
  questionSimilarity: number;
  answerSimilarity: number;
}

export type DedupeLevel = "duplicate" | "suspicious" | "none";

export interface DedupeVerdict {
  level: DedupeLevel;
  score: number;
  reason: string;
  match: DedupeMatch | null;
}

const NONE: DedupeVerdict = { level: "none", score: 0, reason: "لا يوجد تشابه مؤثر", match: null };

export const isContextual = (s: Pick<DedupeSubject, "type" | "media">) =>
  CONTEXT_TYPES.has(s.type) || isQrType(s.type as QuestionType) || !!s.media;

// ------------------------------------------------------------------ trigram (مطابق لـ pg_trgm)
/** ثلاثيات pg_trgm: كل كلمة تُحاط بمسافتين قبلها ومسافة بعدها */
function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    const chars = [...`  ${w} `];
    for (let i = 0; i + 3 <= chars.length; i++) out.add(chars.slice(i, i + 3).join(""));
  }
  return out;
}

/** similarity() كما في pg_trgm — للاختبارات والمقارنات داخل الدفعة */
export function trigramSimilarity(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const t of A) if (B.has(t)) common++;
  return common / (A.size + B.size - common);
}

// ------------------------------------------------------------------ التصنيف
export function classifyMatch(subject: DedupeSubject, m: DedupeMatch): DedupeVerdict {
  const T = DEDUPE_THRESHOLDS;
  const sameAnswer = !!subject.na && subject.na === m.na;

  if (isContextual(subject) || isContextual(m)) {
    // أسئلة سياق: نص السؤال وحده لا يكفي أبدًا
    const sameMedia = !!subject.media && subject.media === m.media;
    if (sameMedia && sameAnswer) return { level: "duplicate", score: 1, reason: "نفس الوسائط ونفس الإجابة", match: m };
    if (sameMedia) return { level: "suspicious", score: 0.8, reason: "نفس الوسائط بإجابة مختلفة — تعارض محتمل", match: m };
    if (sameAnswer && subject.type === m.type && m.questionSimilarity >= T.TEXT_SUSPECT_QUESTION)
      return { level: "suspicious", score: 0.7, reason: "نفس النوع والإجابة بوسائط مختلفة/مفقودة", match: m };
    return NONE;
  }

  const q = m.questionSimilarity;
  const a = m.answerSimilarity;
  const score = (q + a) / 2;
  if (q >= T.TEXT_DUPLICATE_QUESTION && a >= T.TEXT_DUPLICATE_ANSWER)
    return { level: "duplicate", score, reason: q === 1 && a === 1 ? "تطابق تام بعد التطبيع" : "سؤال وإجابة شبه متطابقين", match: m };
  if (q >= T.CONFLICT_QUESTION && a < T.CONFLICT_MAX_ANSWER)
    return { level: "suspicious", score, reason: "نفس السؤال تقريبًا بإجابة مختلفة — تعارض أو تغيّر في الحقيقة", match: m };
  // مرجعان مختلفان (wikidata:Q40 مقابل wikidata:Q38) = سؤالان عن كيانين مختلفين بنفس القالب
  const differentEntities = !!subject.reference && !!m.reference && subject.reference !== m.reference;
  if (!differentEntities && q >= T.TEXT_SUSPECT_QUESTION && a >= T.TEXT_SUSPECT_ANSWER)
    return { level: "suspicious", score, reason: "إعادة صياغة محتملة", match: m };
  if (subject.reference && subject.reference === m.reference && a >= T.SAME_ENTITY_ANSWER)
    return { level: "suspicious", score, reason: "نفس الكيان المرجعي ونفس الإجابة بصياغة مختلفة", match: m };
  return NONE;
}

const RANK: Record<DedupeLevel, number> = { duplicate: 2, suspicious: 1, none: 0 };

/** أسوأ حكم بين كل المطابقات (المكرر قبل المشبوه، ثم الأعلى درجة، ثم الإنتاج قبل المرشحين) */
export function pickVerdict(subject: DedupeSubject, matches: DedupeMatch[]): DedupeVerdict {
  let best = NONE;
  for (const m of matches) {
    const v = classifyMatch(subject, m);
    const better =
      RANK[v.level] > RANK[best.level] ||
      (RANK[v.level] === RANK[best.level] && v.level !== "none" &&
        (v.score > best.score || (v.score === best.score && v.match?.source === "question" && best.match?.source !== "question")));
    if (better) best = v;
  }
  return best;
}

/** يبني مطابقة من نصين خام (للاختبارات وللمقارنة داخل الدفعة) */
export function matchFromRaw(
  source: DedupeMatch["source"],
  id: string,
  subject: DedupeSubject,
  raw: { type: string; question_text: string; answer: string; media?: string | null; reference?: string | null },
): DedupeMatch {
  const nq = normalizeArabicForComparison(raw.question_text);
  const na = normalizeArabicForComparison(raw.answer);
  return {
    source,
    id,
    type: raw.type,
    nq,
    na,
    media: raw.media ?? null,
    reference: raw.reference ?? null,
    questionSimilarity: nq === subject.nq ? 1 : trigramSimilarity(subject.nq, nq),
    answerSimilarity: na === subject.na ? 1 : trigramSimilarity(subject.na, na),
  };
}

// ------------------------------------------------------------------ قاعدة البيانات
const FINGERPRINT_PAGE = 1000;
const FINGERPRINT_MAX_PAGES = 50;

/**
 * يحدّث question_fingerprints (نسخة مطبّعة من public.questions) تدريجيًا حسب updated_at.
 * التطبيع يتم هنا في TypeScript (نفس دالة المرشحين) — لا توجد نسخة SQL من التطبيع.
 * الحذف يتم تلقائيًا (on delete cascade).
 */
export async function refreshQuestionFingerprints(sb: SupabaseClient): Promise<{ refreshed: number }> {
  const { data: last, error: lastErr } = await sb
    .from("question_fingerprints")
    .select("source_updated_at")
    .order("source_updated_at", { ascending: false })
    .limit(1);
  if (lastErr) throw new Error(`fingerprints/last: ${lastErr.message}`);
  const since: string | null = last?.[0]?.source_updated_at ?? null;

  let refreshed = 0;
  for (let page = 0; page < FINGERPRINT_MAX_PAGES; page++) {
    let q = sb
      .from("questions")
      .select("id,type,question_text,answer,image_url,audio_url,video_url,reference,updated_at")
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true })
      .range(page * FINGERPRINT_PAGE, page * FINGERPRINT_PAGE + FINGERPRINT_PAGE - 1);
    // gte (وليس gt): صفوف بنفس الطابع الزمني قد تكون فاتت — upsert آمن للتكرار
    if (since) q = q.gte("updated_at", since);
    const { data, error } = await q;
    if (error) throw new Error(`fingerprints/questions: ${error.message}`);
    const rows = (data ?? []) as {
      id: string; type: string; question_text: string; answer: string;
      image_url: string | null; audio_url: string | null; video_url: string | null; reference: string | null; updated_at: string;
    }[];
    if (rows.length) {
      const { error: upErr } = await sb.from("question_fingerprints").upsert(
        rows.map((r) => ({
          question_id: r.id,
          type: r.type,
          normalized_question_text: normalizeArabicForComparison(r.question_text),
          normalized_answer: normalizeArabicForComparison(r.answer),
          media_url: r.image_url ?? r.audio_url ?? r.video_url ?? null,
          reference: r.reference,
          source_updated_at: r.updated_at,
          refreshed_at: new Date().toISOString(),
        })),
        { onConflict: "question_id" },
      );
      if (upErr) throw new Error(`fingerprints/upsert: ${upErr.message}`);
      refreshed += rows.length;
    }
    if (rows.length < FINGERPRINT_PAGE) break;
  }
  return { refreshed };
}

interface DuplicateRpcRow {
  candidate_id: string;
  match_source: "question" | "candidate";
  match_id: string;
  match_type: string | null;
  match_question: string | null;
  match_answer: string | null;
  match_media: string | null;
  match_reference: string | null;
  question_similarity: number | null;
  answer_similarity: number | null;
}

/** يستدعي factory_find_duplicates (009) ويرجع المطابقات لكل مرشّح */
export async function findDuplicateMatches(sb: SupabaseClient, candidateIds: string[]): Promise<Map<string, DedupeMatch[]>> {
  const out = new Map<string, DedupeMatch[]>();
  for (let i = 0; i < candidateIds.length; i += 100) {
    const { data, error } = await sb.rpc("factory_find_duplicates", {
      p_candidate_ids: candidateIds.slice(i, i + 100),
      p_min_similarity: DEDUPE_THRESHOLDS.PREFILTER_SIMILARITY,
      p_limit: DEDUPE_THRESHOLDS.MATCH_LIMIT,
    });
    if (error) throw new Error(`factory_find_duplicates: ${error.message}`);
    for (const r of (data ?? []) as DuplicateRpcRow[]) {
      const list = out.get(r.candidate_id) ?? [];
      list.push({
        source: r.match_source,
        id: r.match_id,
        type: r.match_type ?? "text",
        nq: r.match_question ?? "",
        na: r.match_answer ?? "",
        media: r.match_media,
        reference: r.match_reference,
        questionSimilarity: Number(r.question_similarity ?? 0),
        answerSimilarity: Number(r.answer_similarity ?? 0),
      });
      out.set(r.candidate_id, list);
    }
  }
  return out;
}
