// اختبار سريع لمصنع الأسئلة (بدون قاعدة بيانات أو شبكة): npm run test:factory
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeArabicForComparison as norm } from "../src/lib/factory/normalize-ar";
import { DEDUPE_THRESHOLDS, matchFromRaw, pickVerdict, trigramSimilarity, type DedupeSubject } from "../src/lib/factory/dedupe";
import { runCandidateChecks, hasHardFailure, type CheckContext } from "../src/lib/factory/checks";
import { countriesToFacts } from "../src/lib/factory/providers/wikidata";
import { FACTORY_WIKIDATA_SOURCE, generateWikidataCandidate } from "../src/lib/factory/generators/wikidata-templates";
import type { CandidatePayload, SourceFact } from "../src/lib/factory/types";
import { commonsThumbUrl, groupBindings, resolveAnimalClass, subjectsToFacts, takeNewSubjects } from "../src/lib/factory/providers/wikidata-recipes";
import { withAl } from "../src/lib/factory/generators/wikidata-templates";
import { decideAfterReview, isFatalAiError, needsAiReview, type AiReview } from "../src/lib/factory/ai/review";
import { DETERMINISTIC_ALLOWLIST, dedupeLevelFromChecks, deterministicDecision, resolveRunConfig } from "../src/lib/factory/review-modes";
import { ENTITY_AUTO_PUBLISH_BLOCKLIST, RELATION_REVIEW_RULES, autoPublishPolicyHolds } from "../src/lib/factory/policy/auto-publish-policy";
import { WIKIDATA_ARABIC_OVERRIDES, arabicOverrideFor } from "../src/lib/factory/policy/wikidata-arabic-overrides";
import type { WikidataCountry } from "../src/lib/importers/wikidata";

let passed = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`❌ ${name}`);
    throw e;
  }
};

// =====================================================================
// 1) التطبيع
// =====================================================================
test("diacritics", () => assert.equal(norm("عاصِمَةُ الأُرْدُنّ"), "عاصمه الاردن"));
test("alef variants", () => assert.equal(norm("أحمد إبراهيم آدم ٱلله"), "احمد ابراهيم ادم الله"));
test("taa marbuta", () => assert.equal(norm("مدرسة"), "مدرسه"));
test("alef maqsura", () => assert.equal(norm("مستشفى"), "مستشفي"));
test("tatweel", () => assert.equal(norm("مــدرســة"), "مدرسه"));
test("arabic-indic digits", () => assert.equal(norm("سنة ١٩٩٠"), "سنه 1990"));
test("persian digits", () => assert.equal(norm("سنة ۱۹۹۰ و۲۰۲۶"), "سنه 1990 و2026"));
test("punctuation", () => assert.equal(norm("«ما عاصمة الأردن؟» — (سؤال)!"), "ما عاصمه الاردن سؤال"));
test("latin + whitespace", () => assert.equal(norm("  Hello,   WORLD! 2026 "), "hello world 2026"));
test("presentation forms (NFKC)", () => assert.equal(norm("ﻻ إله إلا الله"), "لا اله الا الله"));
test("quranic marks", () => assert.equal(norm("إِبْرَاهِيمُ — آية «٣»"), "ابراهيم ايه 3"));
test("idempotent", () => {
  const once = norm("ما عاصِمَةُ الأُرْدُنّ؟ ١٢");
  assert.equal(norm(once), once);
});

// =====================================================================
// 2) التشابه (مطابق لـ pg_trgm)
// =====================================================================
test("trigram identical = 1", () => assert.equal(trigramSimilarity("ما عاصمه الاردن", "ما عاصمه الاردن"), 1));
test("trigram disjoint = 0", () => assert.equal(trigramSimilarity("abc", "xyz"), 0));
test("trigram pg_trgm reference value", () => {
  // select similarity('word', 'two words') = 0.36363637 في PostgreSQL
  assert.ok(Math.abs(trigramSimilarity("word", "two words") - 0.36363637) < 1e-6);
});

// =====================================================================
// 3) كشف التكرار
// =====================================================================
const subject = (type: string, q: string, a: string, media: string | null = null, reference: string | null = null): DedupeSubject => ({
  type,
  nq: norm(q),
  na: norm(a),
  media,
  reference,
});

test("same text + same answer = duplicate", () => {
  const s = subject("text", "ما عاصمة الأردن؟", "عمّان");
  const v = pickVerdict(s, [matchFromRaw("candidate", "c1", s, { type: "text", question_text: "ما عاصِمة الاردن", answer: "عمان" })]);
  assert.equal(v.level, "duplicate");
  assert.equal(v.score, 1);
});

test("paraphrase-ish with same answer = suspicious", () => {
  const s = subject("text", "ما هي عاصمة دولة الأردن؟", "عمان");
  const m = matchFromRaw("question", "q1", s, { type: "text", question_text: "ما عاصمة الأردن؟", answer: "عمّان" });
  assert.ok(m.questionSimilarity >= DEDUPE_THRESHOLDS.TEXT_SUSPECT_QUESTION && m.questionSimilarity < DEDUPE_THRESHOLDS.TEXT_DUPLICATE_QUESTION, `q-sim ${m.questionSimilarity}`);
  assert.equal(pickVerdict(s, [m]).level, "suspicious");
});

test("same question, different answer = suspicious (conflict)", () => {
  const s = subject("text", "ما عاصمة بوليفيا؟", "سوكري");
  const v = pickVerdict(s, [matchFromRaw("question", "q1", s, { type: "text", question_text: "ما عاصمة بوليفيا؟", answer: "لاباز" })]);
  assert.equal(v.level, "suspicious");
});

test("different country capitals are NOT duplicates", () => {
  const s = subject("text", "ما عاصمة النمسا؟", "فيينا");
  const m = matchFromRaw("question", "q1", s, { type: "text", question_text: "ما عاصمة النرويج؟", answer: "أوسلو" });
  assert.ok(m.questionSimilarity < DEDUPE_THRESHOLDS.TEXT_SUSPECT_QUESTION, `q-sim ${m.questionSimilarity}`);
  assert.equal(pickVerdict(s, [m]).level, "none");
});

test("same generic image prompt + different answers = NOT duplicate", () => {
  const s = subject("identify_image", "لأي دولة هذا العلم؟", "الأردن", "https://commons/flag-jo.svg");
  const v = pickVerdict(s, [
    matchFromRaw("question", "q1", s, { type: "identify_image", question_text: "لأي دولة هذا العلم؟", answer: "فلسطين", media: "https://commons/flag-ps.svg" }),
    matchFromRaw("question", "q2", s, { type: "multiple_choice", question_text: "لأي دولة هذا العلم؟", answer: "العراق", media: "https://commons/flag-iq.svg" }),
  ]);
  assert.equal(v.level, "none");
});

test("same image prompt + same media + same answer = duplicate", () => {
  const s = subject("identify_image", "لأي دولة هذا العلم؟", "الأردن", "https://commons/flag-jo.svg");
  const v = pickVerdict(s, [matchFromRaw("question", "q1", s, { type: "identify_image", question_text: "لأي دولة هذا العلم؟", answer: "الأردن", media: "https://commons/flag-jo.svg" })]);
  assert.equal(v.level, "duplicate");
});

test("same image prompt + same answer + different media = suspicious", () => {
  const s = subject("identify_image", "لأي دولة هذا العلم؟", "الأردن", "https://commons/flag-jo-new.svg");
  const v = pickVerdict(s, [matchFromRaw("question", "q1", s, { type: "identify_image", question_text: "لأي دولة هذا العلم؟", answer: "الأردن", media: "https://commons/flag-jo.svg" })]);
  assert.equal(v.level, "suspicious");
});

test("identical capital question already in production = duplicate (production wins)", () => {
  const s = subject("text", "ما عاصمة اليابان؟", "طوكيو", null, "wikidata:Q17");
  const v = pickVerdict(s, [
    matchFromRaw("candidate", "c9", s, { type: "text", question_text: "ما عاصمة اليابان؟", answer: "طوكيو" }),
    matchFromRaw("question", "q-prod", s, { type: "text", question_text: "ما عاصمة اليابان؟", answer: "طوكيو", reference: "wikidata:Q17" }),
    matchFromRaw("question", "q-other", s, { type: "text", question_text: "ما عاصمة الصين؟", answer: "بكين" }),
  ]);
  assert.equal(v.level, "duplicate");
  assert.equal(v.match?.source, "question");
  assert.equal(v.match?.id, "q-prod");
});

test("same entity + same answer, different phrasing = suspicious", () => {
  // صيغة المستورد القديم مقابل صيغة المصنع لنفس الحقيقة
  const s = subject("text", "ما العملة الرسمية في النمسا؟", "يورو", null, "wikidata:Q40");
  const v = pickVerdict(s, [matchFromRaw("question", "q1", s, { type: "text", question_text: "ما اسم عملة النمسا؟", answer: "يورو", reference: "wikidata:Q40" })]);
  assert.equal(v.level, "suspicious");
});

test("known limitation: same template + same answer WITHOUT references = suspicious (reviewer noise)", () => {
  const s = subject("text", "ما العملة الرسمية في النمسا؟", "يورو");
  const v = pickVerdict(s, [matchFromRaw("question", "q1", s, { type: "text", question_text: "ما العملة الرسمية في إيطاليا؟", answer: "يورو" })]);
  assert.equal(v.level, "suspicious");
});

test("same template, different entity references, same answer = none", () => {
  const s = subject("text", "ما العملة الرسمية في النمسا؟", "يورو", null, "wikidata:Q40");
  const v = pickVerdict(s, [matchFromRaw("question", "q1", s, { type: "text", question_text: "ما العملة الرسمية في إيطاليا؟", answer: "يورو", reference: "wikidata:Q38" })]);
  assert.equal(v.level, "none");
});

// =====================================================================
// 4) الحقائق والقوالب
// =====================================================================
const COUNTRIES: WikidataCountry[] = [
  { id: "Q17", name: "اليابان", links: 300, capitals: [{ id: "Q1490", label: "طوكيو" }], currencies: [{ id: "Q8146", label: "ين ياباني" }] },
  { id: "Q810", name: "الأردن", links: 250, capitals: [{ id: "Q3805", label: "عمّان" }], currencies: [{ id: "Q132", label: "دينار أردني" }] },
  { id: "Q258", name: "جنوب أفريقيا", links: 240, capitals: [{ id: "Q3926", label: "بريتوريا" }, { id: "Q5465", label: "كيب تاون" }, { id: "Q37701", label: "بلومفونتين" }], currencies: [] },
  { id: "Q977", name: "جيبوتي", links: 100, capitals: [{ id: "Q3881", label: "جيبوتي" }], currencies: [] },
];
const NOW = "2026-10-02T00:00:00.000Z";
const asFact = (f: ReturnType<typeof countriesToFacts>[number], id = "f1"): SourceFact => ({ ...f, id, batch_id: null, created_at: NOW });

test("facts: shape, provenance and stable ids", () => {
  const facts = countriesToFacts(COUNTRIES, "capital", 10, NOW);
  assert.equal(facts.length, 6); // 1 + 1 + 3 + 1
  const jo = facts.find((f) => f.external_id === "Q810")!;
  assert.deepEqual(
    { provider: jo.provider, subject: jo.subject, predicate: jo.predicate, object_value: jo.object_value, cat: jo.category_slug, sub: jo.subcategory_slug, name: jo.source_name, lic: jo.source_license, url: jo.source_url },
    { provider: "wikidata", subject: "الأردن", predicate: "capital", object_value: "عمّان", cat: "geography", sub: "capitals", name: "Wikidata", lic: "CC0", url: "https://www.wikidata.org/wiki/Q810" },
  );
  assert.equal(jo.raw_payload.object_id, "Q3805");
  assert.equal(jo.raw_payload.popularity_rank, 1);
});

test("facts: limit counts countries, currency skips countries without values", () => {
  assert.equal(new Set(countriesToFacts(COUNTRIES, "capital", 2, NOW).map((f) => f.external_id)).size, 2);
  assert.deepEqual(countriesToFacts(COUNTRIES, "currency", 10, NOW).map((f) => f.external_id), ["Q17", "Q810"]);
});

test("template: capital candidate is deterministic", () => {
  const fact = asFact(countriesToFacts(COUNTRIES, "capital", 10, NOW).find((f) => f.external_id === "Q810")!);
  const a = generateWikidataCandidate(fact);
  const b = generateWikidataCandidate(fact);
  assert.deepEqual(a, b);
  assert.ok("payload" in a);
  const p = a.payload;
  assert.equal(p.question_text, "ما عاصمة الأردن؟");
  assert.equal(p.answer, "عمّان");
  assert.equal(p.external_id, "wikidata:capital:Q810:Q3805");
  assert.equal(p.import_source, FACTORY_WIKIDATA_SOURCE);
  assert.equal(p.reference, "wikidata:Q810");
  assert.equal(p.language, "ar");
  assert.equal(p.is_active, false);
  assert.equal(p.verified, false);
  assert.equal(p.difficulty, 2); // الترتيب 1 من 4 → 0.25 < 0.28 → 2
  assert.equal(p.depth_level, 1);
});

test("template: currency is one level harder", () => {
  const fact = asFact(countriesToFacts(COUNTRIES, "currency", 10, NOW).find((f) => f.external_id === "Q810")!);
  const r = generateWikidataCandidate(fact);
  assert.ok("payload" in r);
  assert.equal(r.payload.question_text, "ما العملة الرسمية في الأردن؟");
  assert.equal(r.payload.subcategory, "countries");
  assert.equal(r.payload.difficulty, 3);
});

test("template: multi-valued facts are skipped", () => {
  const za = countriesToFacts(COUNTRIES, "capital", 10, NOW).filter((f) => f.external_id === "Q258");
  for (const f of za) assert.ok("skip" in generateWikidataCandidate(asFact(f)));
});

// =====================================================================
// 5) الفحوص
// =====================================================================
const CTX: CheckContext = {
  fact: { provider: "wikidata", source_name: "Wikidata", source_url: "https://www.wikidata.org/wiki/Q810", source_license: "CC0" },
  categories: [{ id: "cat-geo", slug: "geography", name: "جغرافيا" }],
  subcategories: [
    { category_id: "cat-geo", slug: "capitals", name: "عواصم" },
    { category_id: "cat-geo", slug: "countries", name: "دول" },
  ],
};
const validPayload = (): CandidatePayload => {
  const r = generateWikidataCandidate(asFact(countriesToFacts(COUNTRIES, "capital", 10, NOW).find((f) => f.external_id === "Q810")!));
  assert.ok("payload" in r);
  return r.payload;
};
const statusOf = (rs: ReturnType<typeof runCandidateChecks>, name: string) => rs.find((r) => r.check_name === name)?.status;

test("valid Arabic question passes every check", () => {
  const rs = runCandidateChecks(validPayload(), CTX);
  assert.equal(rs.length, 6);
  for (const r of rs) assert.equal(r.status, "pass", `${r.check_name}: ${JSON.stringify(r.details)}`);
  assert.equal(hasHardFailure(rs), false);
});

test("English-only question fails", () => {
  const rs = runCandidateChecks({ ...validPayload(), question_text: "What is the capital of Jordan?", answer: "Amman" }, CTX);
  assert.equal(statusOf(rs, "arabic_language"), "fail");
  assert.equal(hasHardFailure(rs), true);
});

test("Latin proper noun inside Arabic question passes", () => {
  const rs = runCandidateChecks({ ...validPayload(), question_text: "ما الشركة المصنّعة لهاتف iPhone؟", answer: "أبل" }, CTX);
  assert.equal(statusOf(rs, "arabic_language"), "pass");
});

test("answer leakage fails (Djibouti)", () => {
  const r = generateWikidataCandidate(asFact(countriesToFacts(COUNTRIES, "capital", 10, NOW).find((f) => f.external_id === "Q977")!));
  assert.ok("payload" in r);
  const rs = runCandidateChecks(r.payload, CTX);
  assert.equal(statusOf(rs, "answer_not_leaked"), "fail");
});

test("partial leakage warns (Kuwait City)", () => {
  const rs = runCandidateChecks({ ...validPayload(), question_text: "ما عاصمة الكويت؟", answer: "مدينة الكويت" }, CTX);
  assert.equal(statusOf(rs, "answer_not_leaked"), "warning");
});

test("short answers are not checked for leakage", () => {
  const rs = runCandidateChecks({ ...validPayload(), question_text: "كم عدد أركان الإسلام؟ 5 أم 6", answer: "5" }, CTX);
  assert.equal(statusOf(rs, "answer_not_leaked"), "pass");
});

test("missing source fails", () => {
  assert.equal(statusOf(runCandidateChecks({ ...validPayload(), source: null }, CTX), "source_present"), "fail");
  assert.equal(statusOf(runCandidateChecks(validPayload(), { ...CTX, fact: null }), "source_present"), "fail");
});

test("unknown subcategory fails taxonomy", () => {
  assert.equal(statusOf(runCandidateChecks({ ...validPayload(), subcategory: "volcanoes" }, CTX), "taxonomy_valid"), "fail");
});

test("image type without image fails media; text needs none", () => {
  assert.equal(statusOf(runCandidateChecks({ ...validPayload(), type: "identify_image", image_url: null }, CTX), "required_media"), "fail");
  assert.equal(statusOf(runCandidateChecks(validPayload(), CTX), "required_media"), "pass");
});

test("schema: multiple_choice without choices fails", () => {
  assert.equal(statusOf(runCandidateChecks({ ...validPayload(), type: "multiple_choice", choices: null }, CTX), "schema_valid"), "fail");
});

// =====================================================================
// 6) وصفات المجالات
// =====================================================================
test("commons thumb url (500px, md5 path, svg→png)", () => {
  assert.equal(
    commonsThumbUrl("http://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Jordan.svg"),
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Flag_of_Jordan.svg/500px-Flag_of_Jordan.svg.png",
  );
  assert.ok(commonsThumbUrl("Lion waiting in Namibia.jpg").endsWith("/500px-Lion_waiting_in_Namibia.jpg"));
});

const B = (item: string, label: string, links: number, value?: string, valueLabel?: string) => ({
  item: { value: `http://www.wikidata.org/entity/${item}` },
  itemLabel: { value: label },
  links: { value: String(links) },
  ...(value ? { value: { value: /^Q\d+$/.test(value) ? `http://www.wikidata.org/entity/${value}` : value } } : {}),
  ...(valueLabel ? { valueLabel: { value: valueLabel } } : {}),
});

test("groupBindings: unlabeled values still count (multi-value safety)", () => {
  const subs = groupBindings([B("Q30", "الولايات المتحدة", 400, "Q1860", "الإنجليزية"), B("Q30", "الولايات المتحدة", 400, "Q28427", "Q28427")]);
  assert.equal(subs[0].values.length, 2);
  const facts = subjectsToFacts(subs, { id: "official_language", categorySlug: "geography", subcategorySlug: "countries" }, "P37", NOW);
  assert.equal(facts.length, 1); // القيمة بلا اسم عربي لا تصبح حقيقة
  assert.equal(facts[0].raw_payload.value_count, 2); // لكنها تمنع السؤال (قيم متعددة)
  assert.ok("skip" in generateWikidataCandidate(asFact(facts[0])));
});

test("groupBindings: literal values (element symbols)", () => {
  const subs = groupBindings([B("Q897", "ذهب", 277, "Au")], true);
  assert.deepEqual(subs[0].values, [{ id: "Au", label: "Au" }]);
});

test("resolveAnimalClass: birds win over reptiles, ambiguity → null", () => {
  assert.equal(resolveAnimalClass(["Q5113", "Q10811"]), "Q5113");
  assert.equal(resolveAnimalClass(["Q7377", "Q7377"]), "Q7377");
  assert.equal(resolveAnimalClass(["Q7377", "Q127282"]), null);
  assert.equal(resolveAnimalClass([]), null);
});

test("takeNewSubjects: skips seen subjects, keeps all values, respects limit", () => {
  const facts = countriesToFacts(COUNTRIES, "capital", 10, NOW); // اليابان، الأردن، جنوب أفريقيا (3)، جيبوتي
  const picked = takeNewSubjects(facts, new Set(["Q17"]), 2);
  assert.deepEqual([...new Set(picked.map((f) => f.external_id))], ["Q810", "Q258"]);
  assert.equal(picked.filter((f) => f.external_id === "Q258").length, 3);
});

test("templates: element wording uses ال, Latin symbol only warns", () => {
  assert.equal(withAl("ذهب"), "الذهب");
  assert.equal(withAl("الهيدروجين"), "الهيدروجين");
  const [f] = subjectsToFacts(groupBindings([B("Q897", "ذهب", 277, "Au")], true), { id: "element_symbol", categorySlug: "science", subcategorySlug: "chemistry" }, "P246", NOW);
  const r = generateWikidataCandidate(asFact(f));
  assert.ok("payload" in r);
  assert.equal(r.payload.question_text, "ما الرمز الكيميائي لعنصر الذهب؟");
  assert.equal(r.payload.answer, "Au");
  assert.equal(statusOf(runCandidateChecks(r.payload, CTX), "arabic_language"), "warning");
});

test("templates: flag is identify_image keyed by subject only", () => {
  const img = commonsThumbUrl("Flag of Jordan.svg");
  const [f] = subjectsToFacts([{ id: "Q810", name: "الأردن", links: 250, image: img, values: [{ id: img, label: img }] }], { id: "flag", categorySlug: "geography", subcategorySlug: "flags" }, "P41", NOW);
  const r = generateWikidataCandidate(asFact(f));
  assert.ok("payload" in r);
  assert.equal(r.payload.type, "identify_image");
  assert.equal(r.payload.answer, "الأردن");
  assert.equal(r.payload.image_url, img);
  assert.equal(r.payload.external_id, "wikidata:flag:Q810");
});

test("templates: animal_class MC is deterministic with 4 distinct choices", () => {
  const [f] = subjectsToFacts([{ id: "Q140", name: "أسد", links: 274, values: [{ id: "Q7377", label: "الثدييات" }] }], { id: "animal_class", categorySlug: "science", subcategorySlug: "animals" }, "P171", NOW);
  const a = generateWikidataCandidate(asFact(f));
  const b = generateWikidataCandidate(asFact(f));
  assert.deepEqual(a, b);
  assert.ok("payload" in a);
  assert.equal(a.payload.type, "multiple_choice");
  assert.equal(new Set(a.payload.choices).size, 4);
  assert.ok(a.payload.choices!.includes("الثدييات"));
});

// =====================================================================
// 7) قرار ما بعد مراجعة Claude
// =====================================================================
const review = (r: Partial<AiReview>): AiReview => ({ id: "c1", verdict: "approve", reason: "سليم", fixed_question: null, fixed_answer: null, family_safe: true, ...r });

test("ai: approve → publish unchanged", () => {
  const d = decideAfterReview(validPayload(), review({}), CTX);
  assert.equal(d.action, "publish");
  assert.equal(d.check.status, "pass");
  if (d.action === "publish") assert.equal(d.payload.answer, "عمّان");
});

test("ai: no review (failure/refusal) → hold, never publish", () => {
  assert.equal(decideAfterReview(validPayload(), undefined, CTX).action, "hold");
});

test("ai: reject → reject with reason", () => {
  const d = decideAfterReview(validPayload(), review({ verdict: "reject", reason: "إجابة خاطئة" }), CTX);
  assert.equal(d.action, "reject");
  if (d.action === "reject") assert.match(d.reason, /إجابة خاطئة/);
});

test("ai: fix → re-checked then published with ai-fixed tag", () => {
  const d = decideAfterReview({ ...validPayload(), answer: "واشنطن العاصمة", question_text: "ما عاصمة الولايات المتحدة؟" }, review({ verdict: "fix", fixed_answer: "واشنطن" }), CTX);
  assert.equal(d.action, "publish");
  if (d.action === "publish") {
    assert.equal(d.payload.answer, "واشنطن");
    assert.ok(d.payload.tags?.includes("ai-fixed"));
  }
});

test("ai: fix that leaks the answer → hold", () => {
  assert.equal(decideAfterReview(validPayload(), review({ verdict: "fix", fixed_answer: "الأردن" }), CTX).action, "hold");
});

test("ai: fix in non-Arabic → hold", () => {
  assert.equal(decideAfterReview(validPayload(), review({ verdict: "fix", fixed_question: "What is the capital?" }), CTX).action, "hold");
});

test("ai: family_safe=false is kept on publish", () => {
  const d = decideAfterReview(validPayload(), review({ family_safe: false }), CTX);
  assert.ok(d.action === "publish" && d.payload.family_safe === false);
});

test("ai: MC fix keeps the answer inside the choices", () => {
  const mc: CandidatePayload = { ...validPayload(), type: "multiple_choice", question_text: "إلى أي طائفة ينتمي «الحوت الأزرق»؟", answer: "ثدييات", choices: ["ثدييات", "أسماك", "طيور", "زواحف"] };
  const d = decideAfterReview(mc, review({ verdict: "fix", fixed_answer: "الثدييات" }), CTX);
  assert.ok(d.action === "publish" && d.payload.choices!.includes("الثدييات") && !d.payload.choices!.includes("ثدييات"));
});

// =====================================================================
// 8) تقوية إعادة المحاولة
// =====================================================================
test("isFatalAiError: credit/auth/permission/not-found are fatal; rate limit and 5xx are not", () => {
  for (const s of [400, 401, 403, 404]) assert.equal(isFatalAiError({ status: s }), true, String(s));
  for (const s of [429, 500, 529]) assert.equal(isFatalAiError({ status: s }), false, String(s));
  assert.equal(isFatalAiError(new Error("network")), false);
});

const chk = (check_name: string, status: string, details: Record<string, unknown> | null = {}) => ({ check_name, status, details });
test("needsAiReview: held after Claude failure → pending", () => {
  assert.equal(needsAiReview([chk("schema_valid", "pass"), chk("arabic_language", "warning"), chk("duplicate", "pass"), chk("ai_review", "warning", { reason: "لا توجد مراجعة" })]), true);
  assert.equal(needsAiReview([chk("schema_valid", "pass"), chk("duplicate", "pass")]), true);
});
test("needsAiReview: real verdict, failure, or suspicious → not pending", () => {
  assert.equal(needsAiReview([chk("duplicate", "pass"), chk("ai_review", "warning", { verdict: "fix" })]), false);
  assert.equal(needsAiReview([chk("duplicate", "pass"), chk("ai_review", "pass", { verdict: "approve" })]), false);
  assert.equal(needsAiReview([chk("duplicate", "fail")]), false);
  assert.equal(needsAiReview([chk("duplicate", "warning")]), false);
  assert.equal(needsAiReview([chk("duplicate", "pass"), chk("answer_not_leaked", "fail")]), false);
});

// =====================================================================
// 9) المراجعة الثابتة المجانية (FACTORY_REVIEW_MODE=deterministic)
// =====================================================================
const CTX_ALL: CheckContext = {
  ...CTX,
  categories: [...CTX.categories, { id: "cat-sci", slug: "science", name: "علوم" }, { id: "cat-isl", slug: "islamic", name: "الإسلاميات" }],
  subcategories: [
    ...CTX.subcategories,
    { category_id: "cat-sci", slug: "chemistry", name: "كيمياء" },
    { category_id: "cat-sci", slug: "animals", name: "حيوانات" },
    { category_id: "cat-geo", slug: "flags", name: "أعلام" },
    { category_id: "cat-isl", slug: "quran", name: "القرآن" },
  ],
};

/** المسار الحقيقي: حقيقة → قالب → فحوص ثابتة → قرار */
function decide(fact: SourceFact, dedupe: "none" | "suspicious" | "duplicate" = "none", tweak: (p: CandidatePayload) => CandidatePayload = (p) => p) {
  const r = generateWikidataCandidate(fact);
  assert.ok("payload" in r, "template skipped: " + JSON.stringify(r));
  const payload = tweak(r.payload);
  const checks = runCandidateChecks(payload, { ...CTX_ALL, fact });
  const dupStatus = dedupe === "duplicate" ? "fail" : dedupe === "suspicious" ? "warning" : "pass";
  return deterministicDecision({ payload, fact, checks: [...checks, { check_name: "duplicate", status: dupStatus }], dedupe });
}
const capitalJo = () => asFact(countriesToFacts(COUNTRIES, "capital", 10, NOW).find((f) => f.external_id === "Q810")!);
const currencyJo = () => asFact(countriesToFacts(COUNTRIES, "currency", 10, NOW).find((f) => f.external_id === "Q810")!);
const elementFact = (recipe: "element_symbol" | "atomic_number", value: string) =>
  asFact(subjectsToFacts(groupBindings([B("Q897", "ذهب", 277, value)], true), { id: recipe, categorySlug: "science", subcategorySlug: "chemistry" }, recipe === "element_symbol" ? "P246" : "P1086", NOW)[0]);

test("deterministic: capital auto-approves", () => assert.equal(decide(capitalJo()).action, "publish"));
test("deterministic: currency auto-approves", () => assert.equal(decide(currencyJo()).action, "publish"));
test("deterministic: element_symbol auto-approves (Latin symbol allowed)", () => assert.equal(decide(elementFact("element_symbol", "Au")).action, "publish"));
test("deterministic: atomic_number auto-approves", () => assert.equal(decide(elementFact("atomic_number", "79")).action, "publish"));

test("deterministic: duplicate never publishes (auto_rejected)", () => {
  const d = decide(capitalJo(), "duplicate");
  assert.equal(d.action, "reject");
  assert.equal(d.check.status, "fail");
});
test("deterministic: suspicious never publishes (stays needs_review)", () => assert.equal(decide(capitalJo(), "suspicious").action, "hold"));
test("deterministic: ambiguous fact never publishes", () => {
  const multi: SourceFact = { ...capitalJo(), raw_payload: { ...capitalJo().raw_payload, value_count: 2 } };
  const payload = (generateWikidataCandidate(capitalJo()) as { payload: CandidatePayload }).payload;
  const checks = [...runCandidateChecks(payload, { ...CTX_ALL, fact: multi }), { check_name: "duplicate", status: "pass" as const }];
  assert.equal(deterministicDecision({ payload, fact: multi, checks, dedupe: "none" }).action, "hold");
  assert.equal(decide(capitalJo(), "none", (p) => ({ ...p, answer: "تبليسي (تفليس)" })).action, "hold");
  assert.equal(decide(capitalJo(), "none", (p) => ({ ...p, answer: "لاباز أو سوكري" })).action, "hold");
});
test("deterministic: non-allowlisted fact types stay needs_review", () => {
  const lion = asFact(subjectsToFacts([{ id: "Q140", name: "أسد", links: 274, values: [{ id: "Q7377", label: "الثدييات" }] }], { id: "animal_class", categorySlug: "science", subcategorySlug: "animals" }, "P171", NOW)[0]);
  const d = decide(lion);
  assert.equal(d.action, "hold");
  assert.ok(d.reasons.some((r) => r.includes("animal_class")));
  const img = commonsThumbUrl("Flag of Jordan.svg");
  const flag = asFact(subjectsToFacts([{ id: "Q810", name: "الأردن", links: 250, image: img, values: [{ id: img, label: img }] }], { id: "flag", categorySlug: "geography", subcategorySlug: "flags" }, "P41", NOW)[0]);
  assert.equal(decide(flag).action, "hold");
});
test("deterministic: hard check failure → auto_rejected (Djibouti leak)", () => {
  const dj = asFact(countriesToFacts(COUNTRIES, "capital", 10, NOW).find((f) => f.external_id === "Q977")!);
  assert.equal(decide(dj).action, "reject");
});
test("deterministic: partial leak, family_safe=false, islamic, wrong license → hold", () => {
  assert.equal(decide(capitalJo(), "none", (p) => ({ ...p, question_text: "ما عاصمة الولايات المتحدة؟", answer: "واشنطن العاصمة" })).action, "hold");
  assert.equal(decide(capitalJo(), "none", (p) => ({ ...p, family_safe: false })).action, "hold");
  assert.equal(decide(capitalJo(), "none", (p) => ({ ...p, category: "islamic", subcategory: "quran" })).action, "hold");
  assert.equal(decide({ ...capitalJo(), source_license: "CC BY-SA" }).action, "hold");
});
test("deterministic: dedupe level is read from saved checks", () => {
  assert.equal(dedupeLevelFromChecks([{ check_name: "duplicate", status: "pass" }]), "none");
  assert.equal(dedupeLevelFromChecks([{ check_name: "duplicate", status: "warning" }]), "suspicious");
  assert.equal(dedupeLevelFromChecks([{ check_name: "duplicate", status: "fail" }]), "duplicate");
  assert.equal(dedupeLevelFromChecks([]), null);
});

// ---------------------------------------------------------------- الإعدادات
test("config: deterministic is the default and needs no ANTHROPIC_API_KEY", () => {
  const c = resolveRunConfig({ env: {} });
  assert.ok(c.ok);
  if (c.ok) {
    assert.equal(c.mode, "deterministic");
    assert.deepEqual(c.recipeIds, [...DETERMINISTIC_ALLOWLIST]);
  }
});
test("config: deterministic refuses non-allowlisted recipes", () => {
  const c = resolveRunConfig({ env: {}, recipesArg: "capital,animal_image" });
  assert.ok(!c.ok && c.error.includes("animal_image"));
});
test("config: claude mode requires ANTHROPIC_API_KEY", () => {
  assert.ok(!resolveRunConfig({ env: { FACTORY_REVIEW_MODE: "claude" } }).ok);
  assert.ok(!resolveRunConfig({ env: { ANTHROPIC_API_KEY: "" }, modeArg: "claude" }).ok);
  const c = resolveRunConfig({ env: { FACTORY_REVIEW_MODE: "claude", ANTHROPIC_API_KEY: "sk-ant-x" } });
  assert.ok(c.ok && c.mode === "claude" && c.recipeIds.includes("animal_image"));
});
test("config: invalid mode is rejected", () => assert.ok(!resolveRunConfig({ env: { FACTORY_REVIEW_MODE: "yolo" } }).ok));
test("config: allowlist excludes animals, landmarks, flags", () => {
  for (const r of ["animal_class", "animal_image", "heritage_country", "flag"]) assert.ok(!DETERMINISTIC_ALLOWLIST.includes(r), r);
});

test("workflow: daily run defaults to deterministic and works without the Anthropic secret", () => {
  const wf = readFileSync(".github/workflows/question-factory.yml", "utf8");
  assert.match(wf, /FACTORY_REVIEW_MODE: \$\{\{ vars\.FACTORY_REVIEW_MODE \|\| 'deterministic' \}\}/);
  assert.match(wf, /npm run factory:daily/);
  assert.match(wf, /schedule:/);
  // ما يراه السكربت في GitHub عند غياب السر: مفتاح فارغ + الوضع الافتراضي
  const c = resolveRunConfig({ env: { FACTORY_REVIEW_MODE: "deterministic", ANTHROPIC_API_KEY: "" } });
  assert.ok(c.ok && c.mode === "deterministic");
});

// =====================================================================
// 10) سياسة النشر المركزية + تصحيح الأسماء حسب QID
// =====================================================================
const POLICY_COUNTRIES: WikidataCountry[] = [
  { id: "Q233", name: "مالطا", links: 200, capitals: [{ id: "Q23800", label: "البلد" }], currencies: [{ id: "Q4916", label: "يورو" }] },
  { id: "Q215", name: "سلوفينيا", links: 190, capitals: [{ id: "Q437", label: "لبلانة" }], currencies: [] },
  { id: "Q1008", name: "ساحل العاج", links: 180, capitals: [{ id: "Q3768", label: "ياموسوكرو" }], currencies: [{ id: "Q861690", label: "فرنك غرب أفريقي" }] },
  { id: "Q801", name: "إسرائيل", links: 170, capitals: [{ id: "Q1218", label: "القدس" }], currencies: [{ id: "Q131309", label: "شيكل إسرائيلي جديد" }] },
  { id: "Q31", name: "بلجيكا", links: 160, capitals: [{ id: "Q239", label: "بروكسل" }], currencies: [{ id: "Q4916", label: "يورو" }] },
  // كيان آخر يحمل نفس النص «البلد» صدفةً — يجب ألا يتأثر بتصحيح Q23800
  { id: "Q99001", name: "دولة اختبار", links: 10, capitals: [{ id: "Q99002", label: "البلد" }], currencies: [] },
];
const pf = (type: "capital" | "currency", subject: string) =>
  asFact(countriesToFacts(POLICY_COUNTRIES, type, 10, NOW).find((f) => f.external_id === subject)!);
const CTX_POLICY: CheckContext = { ...CTX_ALL };

test("policy: blocked entity (subject) cannot deterministic auto-publish", () => {
  const d = decide(pf("currency", "Q801"));
  assert.equal(d.action, "hold");
  assert.ok(d.reasons.some((r) => r.includes("Q801")));
  assert.ok(autoPublishPolicyHolds(pf("currency", "Q801")).length > 0);
});
test("policy: blocked entity as the ANSWER also holds (Q1218 as capital)", () => {
  const reasons = autoPublishPolicyHolds(pf("capital", "Q801"));
  assert.ok(reasons.some((r) => r.includes("Q1218")));
});
test("policy: relation-specific hold — Ivory Coast capital held, its currency is not blocked by policy", () => {
  const cap = decide(pf("capital", "Q1008"));
  assert.equal(cap.action, "hold");
  assert.ok(cap.reasons.some((r) => r.includes("Q1008")));
  assert.deepEqual(autoPublishPolicyHolds(pf("currency", "Q1008")), []);
});
test("policy: ambiguous capitals from the audit stay held", () => {
  for (const qid of ["Q1008", "Q962", "Q924", "Q836", "Q967"]) {
    assert.ok(autoPublishPolicyHolds({ predicate: "capital", raw_payload: { subject_id: qid, object_id: "Qx" } }).length > 0, qid);
  }
  assert.ok(autoPublishPolicyHolds({ predicate: "currency", raw_payload: { subject_id: "Q717", object_id: "Q56349362" } }).length > 0);
});
test("policy: normal safe country still auto-publishes", () => {
  assert.deepEqual(autoPublishPolicyHolds(pf("capital", "Q31")), []);
  assert.equal(decide(pf("capital", "Q31")).action, "publish");
  assert.equal(decide(pf("currency", "Q31")).action, "publish");
});
test("policy: matching is by QID only, never by text", () => {
  assert.deepEqual(autoPublishPolicyHolds({ predicate: "capital", raw_payload: { subject_id: "Q99001", object_id: "Q99002" } }), []);
  assert.deepEqual(autoPublishPolicyHolds({ predicate: "capital", raw_payload: {} }), []);
  assert.deepEqual(autoPublishPolicyHolds(null), []);
});

test("override: QID override changes the generated answer (Valletta)", () => {
  const r = generateWikidataCandidate(pf("capital", "Q233"));
  assert.ok("payload" in r);
  assert.equal(r.payload.answer, "فاليتا");
  assert.deepEqual(r.payload.extra?.label_overrides, ["Q23800"]);
  assert.equal(r.payload.external_id, "wikidata:capital:Q233:Q23800"); // المعرّف ثابت لا يتغير بالتصحيح
  assert.equal(decide(pf("capital", "Q233")).action, "publish");
});
test("override: aliases are preserved in extra.answer_aliases", () => {
  const r = generateWikidataCandidate(pf("capital", "Q215"));
  assert.ok("payload" in r);
  assert.equal(r.payload.answer, "ليوبليانا");
  assert.deepEqual(r.payload.extra?.answer_aliases, ["لبلانة"]);
});
test("override: raw string coincidence does not trigger an unrelated override", () => {
  const r = generateWikidataCandidate(pf("capital", "Q99001"));
  assert.ok("payload" in r);
  assert.equal(r.payload.answer, "البلد"); // نفس النص لكن QID مختلف ← بلا تصحيح
  assert.equal(r.payload.extra, undefined);
  assert.equal(arabicOverrideFor("Q99002"), null);
  assert.equal(arabicOverrideFor("البلد"), null);
});
test("override: every override and policy entry uses a QID key", () => {
  for (const o of WIKIDATA_ARABIC_OVERRIDES) assert.match(o.qid, /^Q\d+$/);
  for (const e of [...ENTITY_AUTO_PUBLISH_BLOCKLIST, ...RELATION_REVIEW_RULES]) assert.match(e.qid, /^Q\d+$/);
  assert.equal(new Set(WIKIDATA_ARABIC_OVERRIDES.map((o) => o.qid)).size, WIKIDATA_ARABIC_OVERRIDES.length);
});
test("existing deterministic types keep working with the policy layer", () => {
  assert.equal(decide(capitalJo()).action, "publish");
  assert.equal(decide(currencyJo()).action, "publish");
  assert.equal(decide(elementFact("element_symbol", "Au")).action, "publish");
  assert.equal(decide(elementFact("atomic_number", "79")).action, "publish");
  void CTX_POLICY;
});

console.log(`✅ كل اختبارات المصنع نجحت (${passed} اختبار)`);
