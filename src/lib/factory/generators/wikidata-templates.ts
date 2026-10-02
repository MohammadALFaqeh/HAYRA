// قوالب ثابتة (بدون LLM) تحوّل حقائق Wikidata إلى مرشّحين بصيغة QuestionDraft.
// حقيقة واحدة ← مرشّح واحد. لا صياغات متعددة في هذه المرحلة.
import { depthFor, hash, seededRandom, shuffleWith } from "@/lib/importers/types";
import { popularityDifficulty } from "@/lib/importers/wikidata";
import type { QuestionType } from "@/lib/game/types";
import type { CandidatePayload, SourceFact } from "../types";
import { ANIMAL_CLASSES } from "../providers/wikidata-recipes";
import { arabicOverrideFor } from "../policy/wikidata-arabic-overrides";

/** يميّز أسئلة المصنع عن المستورد القديم (import_source = "wikidata") */
export const FACTORY_WIKIDATA_SOURCE = "factory-wikidata";
const SOURCE_LABEL = "Wikidata (CC0)";

export type TemplateResult = { payload: CandidatePayload } | { skip: string };

type TemplateFact = Pick<SourceFact, "provider" | "external_id" | "subject" | "predicate" | "object_value" | "category_slug" | "subcategory_slug" | "raw_payload">;

interface Built {
  type: QuestionType;
  question_text: string;
  answer: string;
  choices?: string[];
  image_url?: string | null;
  tags: string[];
  explanation?: string | null;
}

interface Template {
  /** إزاحة الصعوبة عن صعوبة الشهرة (العملة أصعب من العاصمة…) */
  difficultyOffset: number;
  build(fact: TemplateFact): Built | string;
  /** أسئلة الصور: المعرّف بالموضوع فقط (رابط الصورة طويل وقد يتغير) */
  idBySubjectOnly?: boolean;
}

const deterministicRandom = (seed: string) => seededRandom(parseInt(hash(seed).slice(0, 8), 36));
const str = (v: unknown) => (typeof v === "string" && v ? v : null);
/** «عنصر ذهب» ← «عنصر الذهب» (تسميات Wikidata للعناصر بلا أل التعريف) */
export const withAl = (name: string) => (/^ال/.test(name) || name.includes(" ") ? name : `ال${name}`);

const TEMPLATES: Record<string, Template> = {
  capital: { difficultyOffset: 0, build: (f) => ({ type: "text", question_text: `ما عاصمة ${f.subject}؟`, answer: f.object_value, tags: ["عواصم", "wikidata"] }) },
  // العملات أصعب بدرجة من العواصم (نفس منطق المستورد القديم)
  currency: { difficultyOffset: 1, build: (f) => ({ type: "text", question_text: `ما العملة الرسمية في ${f.subject}؟`, answer: f.object_value, tags: ["عملات", "wikidata"] }) },
  flag: {
    difficultyOffset: 0,
    idBySubjectOnly: true,
    build: (f) => ({ type: "identify_image", question_text: "لأي دولة هذا العلم؟", answer: f.subject, image_url: f.object_value, tags: ["أعلام", "wikidata"] }),
  },
  continent: { difficultyOffset: -1, build: (f) => ({ type: "text", question_text: `في أي قارة تقع ${f.subject}؟`, answer: f.object_value, tags: ["قارات", "wikidata"] }) },
  official_language: {
    difficultyOffset: 1,
    build: (f) => ({ type: "text", question_text: `ما اللغة الرسمية في ${f.subject}؟`, answer: f.object_value, tags: ["لغات", "wikidata"] }),
  },
  element_symbol: {
    difficultyOffset: 1,
    build: (f) => ({ type: "text", question_text: `ما الرمز الكيميائي لعنصر ${withAl(f.subject)}؟`, answer: f.object_value, tags: ["عناصر كيميائية", "wikidata"] }),
  },
  atomic_number: {
    difficultyOffset: 2,
    build: (f) =>
      /^\d+$/.test(f.object_value)
        ? { type: "text", question_text: `ما العدد الذري لعنصر ${withAl(f.subject)}؟`, answer: f.object_value, tags: ["عناصر كيميائية", "wikidata"] }
        : "العدد الذري ليس رقمًا صحيحًا",
  },
  heritage_country: {
    difficultyOffset: 1,
    build: (f) => ({
      type: "text",
      question_text: `في أي دولة يقع «${f.subject}»؟`,
      answer: f.object_value,
      image_url: str(f.raw_payload?.image),
      tags: ["تراث عالمي", "معالم", "wikidata"],
      explanation: `«${f.subject}» من مواقع التراث العالمي لليونسكو`,
    }),
  },
  animal_class: {
    difficultyOffset: 0,
    build: (f) => {
      const others = Object.values(ANIMAL_CLASSES).filter((c) => c !== f.object_value);
      const rnd = deterministicRandom(`animal_class:${f.external_id}`);
      const choices = shuffleWith([f.object_value, ...shuffleWith(others, rnd).slice(0, 3)], rnd);
      return { type: "multiple_choice", question_text: `إلى أي طائفة من الحيوانات ينتمي «${f.subject}»؟`, answer: f.object_value, choices, tags: ["حيوانات", "wikidata"] };
    },
  },
  animal_image: {
    difficultyOffset: 0,
    idBySubjectOnly: true,
    build: (f) => ({ type: "identify_image", question_text: "ما اسم هذا الحيوان؟", answer: f.subject, image_url: f.object_value, tags: ["حيوانات", "صور", "wikidata"] }),
  },
};

export const TEMPLATE_PREDICATES = Object.keys(TEMPLATES);

export function generateWikidataCandidate(fact: TemplateFact): TemplateResult {
  if (fact.provider !== "wikidata") return { skip: "مزوّد غير مدعوم" };
  const tpl = TEMPLATES[fact.predicate];
  if (!tpl) return { skip: `نوع حقيقة غير مدعوم: ${fact.predicate}` };
  if (!fact.category_slug || !fact.subcategory_slug) return { skip: "الحقيقة بدون تصنيف" };

  const raw = fact.raw_payload ?? {};
  // قيم متعددة (أكثر من عاصمة/قارة/لغة): سؤال بإجابة واحدة سيكون مضللًا
  const valueCount = typeof raw.value_count === "number" ? raw.value_count : 1;
  if (valueCount > 1) return { skip: `قيم متعددة (${valueCount}) لـ ${fact.subject}` };

  const rank = typeof raw.popularity_rank === "number" ? raw.popularity_rank : null;
  const total = typeof raw.popularity_total === "number" ? raw.popularity_total : null;
  if (rank === null || total === null) return { skip: "لا توجد بيانات شهرة لحساب الصعوبة" };
  const difficulty = Math.max(1, Math.min(6, popularityDifficulty(rank, total) + tpl.difficultyOffset));

  // تصحيح الأسماء العربية حسب QID (لا حسب النص) قبل بناء السؤال
  const subjOv = arabicOverrideFor(raw.subject_id);
  const objOv = arabicOverrideFor(raw.object_id);
  const display = { ...fact, subject: subjOv?.canonical ?? fact.subject, object_value: objOv?.canonical ?? fact.object_value };
  const built = tpl.build(display);
  if (typeof built === "string") return { skip: built };
  const answerOv = built.answer === display.object_value ? objOv : built.answer === display.subject ? subjOv : null;
  const overridden = [subjOv, objOv].filter(Boolean).map((o) => o!.qid);
  const extra =
    answerOv?.aliases?.length || overridden.length
      ? { ...(answerOv?.aliases?.length ? { answer_aliases: answerOv.aliases } : {}), ...(overridden.length ? { label_overrides: overridden } : {}) }
      : null;

  const subjectId = str(raw.subject_id) ?? fact.external_id;
  const objectId = str(raw.object_id) ?? fact.object_value;

  return {
    payload: {
      category: fact.category_slug,
      subcategory: fact.subcategory_slug,
      type: built.type,
      question_text: built.question_text,
      answer: built.answer,
      ...(built.choices ? { choices: built.choices } : {}),
      ...(built.image_url ? { image_url: built.image_url } : {}),
      ...(built.explanation ? { explanation: built.explanation } : {}),
      // إجابات بديلة مقبولة للمضيف (لا تصل لشاشة التلفزيون: public.ts يقرأ حقولًا محددة من extra فقط)
      ...(extra ? { extra } : {}),
      difficulty,
      depth_level: depthFor(difficulty),
      source: SOURCE_LABEL,
      // نفس صيغة المرجع في المستورد القديم → يسمح بكشف التكرار على مستوى الكيان
      reference: `wikidata:${subjectId}`,
      tags: built.tags,
      family_safe: true,
      verified: false,
      is_active: false,
      language: "ar",
      // معرّفات Wikidata (وليس الأسماء) → ثابت حتى لو تغيّرت التسمية العربية
      external_id: tpl.idBySubjectOnly ? `wikidata:${fact.predicate}:${subjectId}` : `wikidata:${fact.predicate}:${subjectId}:${objectId}`,
      import_source: FACTORY_WIKIDATA_SOURCE,
    },
  };
}
