import type { QuestionType } from "@/lib/game/types";

/** الصيغة الموحدة التي تتحول إليها كل المصادر قبل الحفظ في بنك حيرة */
export interface QuestionDraft {
  category: string; // slug أو الاسم العربي
  subcategory?: string | null;
  type: QuestionType;
  question_text: string;
  answer: string;
  choices?: string[] | null;
  clues?: string[] | null;
  extra?: Record<string, unknown>;
  difficulty: number; // 1..6
  depth_level?: number; // 1..3
  image_url?: string | null;
  audio_url?: string | null;
  video_url?: string | null;
  explanation?: string | null;
  source?: string | null;
  reference?: string | null;
  tags?: string[];
  family_safe?: boolean;
  verified?: boolean;
  is_active?: boolean;
  language?: string;
  external_id?: string | null;
  code?: string | null;
}

export interface ImportResult {
  drafts: QuestionDraft[];
  notes: string[];
}

export type ImportSource = "opentdb" | "quran" | "wikidata" | "tmdb" | "football" | "file";

/** مولد عشوائي ثابت البذرة (لنتائج قابلة للتكرار) */
export function seededRandom(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWith<T>(arr: T[], random: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sampleWith<T>(arr: T[], n: number, random: () => number): T[] {
  return shuffleWith(arr, random).slice(0, Math.max(0, Math.min(n, arr.length)));
}

export const clampDifficulty = (d: number) => Math.max(1, Math.min(6, Math.round(d)));
export const depthFor = (d: number) => (d <= 2 ? 1 : d <= 4 ? 2 : 3);

export async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 25000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} من ${new URL(url).host}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}
