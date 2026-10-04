import { normalizeArabicForComparison as norm } from "@/lib/factory/normalize-ar";

/**
 * كشف الأسئلة «المترابطة» حتى لا تظهر في اللعبة نفسها (تبقى لجلسة أخرى):
 * - نفس المجموعة الصريحة extra.related (مثل كل أسئلة «نهائي 2017»)
 * - نفس الإجابة («كريستيانو رونالدو» في سؤالين)
 * - إجابة سؤال تظهر في نص سؤال آخر (فتكشفه أو تلمّح له)
 * - نص متشابه جدًا (صياغتان للمعلومة نفسها)
 */
export interface RelInfo {
  group: string | null;
  answerKey: string;
  text: string;
  tri: Set<string>;
}

// كلمات شائعة لا تميّز إجابة عن أخرى
const STOP = new Set(["ال", "و", "في", "من", "على", "الى", "عن", "او", "ثم", "مع", "بعد", "قبل", "نعم", "لا", "هو", "هي"]);

const answerKeyOf = (answer: string) =>
  norm(String(answer).replace(/\([^)]*\)/g, " "))
    .split(" ")
    .filter((w) => w && !STOP.has(w))
    .join(" ");

function trigrams(s: string): Set<string> {
  const t = new Set<string>();
  for (const w of s.split(" ")) {
    if (!w) continue;
    const p = `  ${w} `;
    for (let i = 0; i < p.length - 2; i++) t.add(p.slice(i, i + 3));
  }
  return t;
}

// أنواع نصها قالب ثابت («لأي دولة هذا العلم؟»، «من هو اللاعب؟»، تعليمات QR) — لا يُقارن نصها
const TEMPLATE_TEXT = /^(identify_image|image|logo|audio|video|who_am_i|qr_)/;

export function relInfo(q: { question_text?: string | null; answer?: string | null; rel?: string | null; type?: string | null }): RelInfo {
  const text = TEMPLATE_TEXT.test(q.type ?? "") ? "" : norm(q.question_text ?? "");
  return { group: q.rel || null, answerKey: answerKeyOf(q.answer ?? ""), text, tri: trigrams(text) };
}

/** إجابة «مميِّزة» تصلح للمقارنة: ليست رقمًا وحده ولا كلمة قصيرة جدًا */
const meaningful = (k: string) => k.length >= 3 && !/^[0-9 ]+$/.test(k);

const containsWords = (hay: string, needle: string) => ` ${hay} `.includes(` ${needle} `);

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n);
}

export function areRelated(a: RelInfo, b: RelInfo): boolean {
  if (a.group && a.group === b.group) return true;
  if (meaningful(a.answerKey) && a.answerKey === b.answerKey) return true;
  if (meaningful(a.answerKey) && containsWords(b.text, a.answerKey)) return true;
  if (meaningful(b.answerKey) && containsWords(a.text, b.answerKey)) return true;
  return jaccard(a.tri, b.tri) >= 0.5;
}
