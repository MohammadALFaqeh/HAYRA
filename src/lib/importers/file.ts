// استيراد JSON / CSV بصيغة حيرة (انظر supabase/seed/hayra-questions.json كمثال)
import Papa from "papaparse";
import { QUESTION_TYPE_IDS } from "@/lib/game/constants";
import type { QuestionType } from "@/lib/game/types";
import { hash } from "./opentdb";
import { clampDifficulty, depthFor, type QuestionDraft } from "./types";

const list = (v: unknown): string[] | null => {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "string" && v.trim()) {
    const t = v.trim();
    if (t.startsWith("[")) {
      try {
        return list(JSON.parse(t));
      } catch {
        /* تجاهل */
      }
    }
    return t.split("|").map((s) => s.trim()).filter(Boolean);
  }
  return null;
};
const boolish = (v: unknown, fb: boolean) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "نعم"].includes(s)) return true;
    if (["false", "0", "no", "لا"].includes(s)) return false;
  }
  return fb;
};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

export function normalizeRow(raw: Record<string, unknown>, index: number): { draft?: QuestionDraft; error?: string } {
  const category = str(raw.category) ?? str(raw.category_slug);
  const question_text = str(raw.question_text) ?? str(raw.question);
  const rawAnswer = str(raw.answer);
  if (!category) return { error: `صف ${index + 1}: الفئة مفقودة` };
  if (!question_text) return { error: `صف ${index + 1}: نص السؤال مفقود` };
  const type = (str(raw.type) ?? "text") as QuestionType;
  if (!QUESTION_TYPE_IDS.includes(type)) return { error: `صف ${index + 1}: نوع غير معروف (${type})` };

  let difficulty = Number(raw.difficulty);
  if (!Number.isFinite(difficulty) && Number(raw.points)) difficulty = Number(raw.points) / 100;
  if (!Number.isFinite(difficulty)) return { error: `صف ${index + 1}: الصعوبة مفقودة (1..6 أو points 100..600)` };
  difficulty = clampDifficulty(difficulty);

  let extra: Record<string, unknown> = {};
  if (raw.extra && typeof raw.extra === "object") extra = raw.extra as Record<string, unknown>;
  else if (typeof raw.extra === "string" && raw.extra.trim().startsWith("{")) {
    try {
      extra = JSON.parse(raw.extra);
    } catch {
      return { error: `صف ${index + 1}: حقل extra ليس JSON صالحًا` };
    }
  }
  for (const k of ["instructions", "quote", "hint"]) if (str(raw[k])) extra[k] = str(raw[k]);
  if (list(raw.forbidden)) extra.forbidden = list(raw.forbidden);
  if (str(raw.target)) extra.target = str(raw.target);

  const choices = list(raw.choices);
  if (type === "multiple_choice" && (!choices || choices.length < 2)) return { error: `صف ${index + 1}: الاختيارات مطلوبة لسؤال الاختيارات` };
  if (type === "reverse_points" && (!choices || choices.length < 2)) return { error: `صف ${index + 1}: أضف عنصرين على الأقل بترتيب المراكز` };
  if (type === "reverse_points" && (!str(raw.source) || !str(raw.reference))) return { error: `صف ${index + 1}: أسئلة الترتيب تحتاج مصدرًا ومرجعًا واضحين` };
  if (type !== "reverse_points" && !rawAnswer) return { error: `صف ${index + 1}: الإجابة مفقودة` };
  if (type === "multiple_choice" && choices && rawAnswer && !choices.includes(rawAnswer)) return { error: `صف ${index + 1}: الإجابة ليست ضمن الاختيارات` };
  const answer = type === "reverse_points" ? choices!.join(" ← ") : rawAnswer!;

  return {
    draft: {
      category,
      subcategory: str(raw.subcategory) ?? str(raw.subcategory_slug),
      type,
      question_text,
      answer,
      choices,
      clues: list(raw.clues),
      extra,
      difficulty,
      depth_level: Number(raw.depth_level) >= 1 && Number(raw.depth_level) <= 3 ? Number(raw.depth_level) : depthFor(difficulty),
      image_url: str(raw.image_url),
      audio_url: str(raw.audio_url),
      video_url: str(raw.video_url),
      explanation: str(raw.explanation),
      source: str(raw.source),
      reference: str(raw.reference),
      tags: list(raw.tags) ?? [],
      family_safe: boolish(raw.family_safe, true),
      verified: boolish(raw.verified, false),
      is_active: boolish(raw.is_active, true),
      language: str(raw.language) ?? "ar",
      external_id: str(raw.external_id) ?? `file:${hash(question_text + "|" + answer)}`,
      code: str(raw.code),
    },
  };
}

export function parseFileContent(content: string, format: "json" | "csv"): { drafts: QuestionDraft[]; errors: string[] } {
  let rows: Record<string, unknown>[] = [];
  if (format === "json") {
    const parsed = JSON.parse(content);
    rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : [];
  } else {
    const res = Papa.parse<Record<string, unknown>>(content.replace(/^\uFEFF/, ""), { header: true, skipEmptyLines: true });
    rows = res.data;
  }
  const drafts: QuestionDraft[] = [];
  const errors: string[] = [];
  rows.forEach((r, i) => {
    const { draft, error } = normalizeRow(r, i);
    if (draft) drafts.push(draft);
    if (error) errors.push(error);
  });
  return { drafts, errors };
}
