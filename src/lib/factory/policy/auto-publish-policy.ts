// سياسة أمان النشر التلقائي — المصدر الوحيد لقوائم الحجز.
// ليست حكمًا على أي حقيقة أو موقف سياسي: الكيانات هنا فقط لا تُنشر آليًا،
// بل تذهب إلى needs_review لينظر فيها إنسان. المعرّفات QIDs ثابتة من Wikidata
// (مُتحقَّق منها على Wikidata الحي في 2026-10-02) — لا مطابقة نصية.
//
// تُطبَّق قبل الموافقة الآلية في الوضعين (deterministic و claude).

export interface PolicyEntry {
  qid: string;
  /** للبشر فقط — لا يُستخدم في المطابقة */
  label: string;
  reason: string;
}

export interface RelationRule extends PolicyEntry {
  /** نوع الحقيقة (predicate/recipe) الذي يُحجز لهذا الكيان فقط */
  relation: string;
}

const SENSITIVE = "كيان/إقليم حساس — يحتاج مراجعة بشرية قبل النشر";

/** كيانات لا تُنشر آليًا أبدًا، أيًا كان نوع السؤال، سواء كانت الموضوع أو الإجابة */
export const ENTITY_AUTO_PUBLISH_BLOCKLIST: readonly PolicyEntry[] = [
  // من تدقيق 2026-10-02
  { qid: "Q801", label: "Israel", reason: SENSITIVE },
  { qid: "Q865", label: "Taiwan", reason: SENSITIVE },
  // احتياطًا: نفس الفئة (أقاليم/كيانات متنازع عليها) — مُتحقَّق من معرّفاتها
  { qid: "Q219060", label: "State of Palestine", reason: SENSITIVE },
  { qid: "Q1218", label: "Jerusalem", reason: SENSITIVE },
  { qid: "Q1246", label: "Kosovo", reason: SENSITIVE },
  { qid: "Q40362", label: "Sahrawi Arab Democratic Republic", reason: SENSITIVE },
  { qid: "Q23681", label: "Northern Cyprus", reason: SENSITIVE },
  { qid: "Q23334", label: "Abkhazia", reason: SENSITIVE },
  { qid: "Q23427", label: "South Ossetia", reason: SENSITIVE },
  { qid: "Q907112", label: "Transnistria", reason: SENSITIVE },
];

const DISPUTED_CAPITAL = "العاصمة الرسمية تختلف عمّا يجيبه أغلب اللاعبين — يحتاج مراجعة أو قبول إجابات بديلة";

/** حجز علاقة محددة لكيان (لا يمنع بقية أسئلته) */
export const RELATION_REVIEW_RULES: readonly RelationRule[] = [
  { qid: "Q1008", relation: "capital", label: "Ivory Coast", reason: DISPUTED_CAPITAL },
  { qid: "Q962", relation: "capital", label: "Benin", reason: DISPUTED_CAPITAL },
  { qid: "Q924", relation: "capital", label: "Tanzania", reason: DISPUTED_CAPITAL },
  { qid: "Q836", relation: "capital", label: "Myanmar", reason: DISPUTED_CAPITAL },
  { qid: "Q967", relation: "capital", label: "Burundi", reason: DISPUTED_CAPITAL },
  // كيان العملة في Wikidata («بوليفار السيادي» Q56349362) قد يكون قديمًا، ولا بديل مؤكد بعد
  { qid: "Q717", relation: "currency", label: "Venezuela", reason: "عملة الدولة في المصدر قد تكون قديمة — يحتاج مراجعة" },
];

const BLOCKED = new Map(ENTITY_AUTO_PUBLISH_BLOCKLIST.map((e) => [e.qid, e]));
const RELATIONS = new Map(RELATION_REVIEW_RULES.map((r) => [`${r.qid}|${r.relation}`, r]));

/**
 * أسباب الحجز حسب السياسة (فارغ = لا مانع من السياسة).
 * يعتمد فقط على معرّفات raw_payload (subject_id / object_id) — لا على النصوص.
 */
export function autoPublishPolicyHolds(fact: { predicate: string; raw_payload?: Record<string, unknown> | null } | null): string[] {
  if (!fact) return [];
  const subject = typeof fact.raw_payload?.subject_id === "string" ? fact.raw_payload.subject_id : null;
  const object = typeof fact.raw_payload?.object_id === "string" ? fact.raw_payload.object_id : null;
  const reasons: string[] = [];
  for (const [role, qid] of [["الموضوع", subject], ["الإجابة", object]] as const) {
    const hit = qid ? BLOCKED.get(qid) : undefined;
    if (hit) reasons.push(`سياسة النشر: ${role} ${hit.qid} (${hit.label}) — ${hit.reason}`);
  }
  const rel = subject ? RELATIONS.get(`${subject}|${fact.predicate}`) : undefined;
  if (rel) reasons.push(`سياسة النشر: ${rel.relation} لـ ${rel.qid} (${rel.label}) — ${rel.reason}`);
  return reasons;
}
