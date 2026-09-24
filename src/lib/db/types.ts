import type { Level, QuestionType } from "@/lib/game/types";

export type CategoryColor = "gold" | "volt" | "violet" | "leaf" | "wine" | "ember";

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  color: CategoryColor;
  image_url: string | null;
  is_interactive: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface Subcategory {
  id: string;
  category_id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface QuestionRow {
  id: string;
  code: string | null;
  category_id: string;
  subcategory_id: string | null;
  type: QuestionType;
  question_text: string;
  answer: string;
  choices: string[] | null;
  clues: string[] | null;
  extra: Record<string, unknown>;
  difficulty: number;
  points: number;
  depth_level: number;
  image_url: string | null;
  audio_url: string | null;
  video_url: string | null;
  explanation: string | null;
  source: string | null;
  reference: string | null;
  verified: boolean;
  family_safe: boolean;
  tags: string[];
  is_active: boolean;
  is_blacklisted: boolean;
  language: string;
  import_source: string | null;
  import_batch: string | null;
  external_id: string | null;
  times_used: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export type QuestionInsert = Omit<
  QuestionRow,
  "id" | "points" | "times_used" | "last_used_at" | "created_at" | "updated_at" | "code"
> & { code?: string | null };

export interface GamePack {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  emoji: string;
  cover_url: string | null;
  level: Level;
  category_count: number;
  question_types: QuestionType[];
  family_mode: boolean;
  is_seasonal: boolean;
  season_label: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface GamePackCategory {
  id: string;
  pack_id: string;
  category_id: string;
  subcategory_id: string | null;
  sort_order: number;
}

export interface AvailabilityRow {
  category_id: string;
  subcategory_id: string | null;
  difficulty: number;
  total: number;
  family_safe: number;
  verified: number;
}

export type FeedbackRating = "excellent" | "too_easy" | "too_hard" | "unclear" | "needs_review";

export const FEEDBACK_LABELS: Record<FeedbackRating, string> = {
  excellent: "ممتاز 👌",
  too_easy: "سهل جدًا 😴",
  too_hard: "صعب جدًا 🥵",
  unclear: "غير واضح 🤨",
  needs_review: "يحتاج مراجعة 🔍",
};

/** هل الباقة الموسمية فعّالة الآن؟ */
export function packIsLive(p: GamePack, now = new Date()): boolean {
  if (!p.is_active) return false;
  if (p.starts_at && new Date(p.starts_at) > now) return false;
  if (p.ends_at && new Date(p.ends_at) < now) return false;
  return true;
}
