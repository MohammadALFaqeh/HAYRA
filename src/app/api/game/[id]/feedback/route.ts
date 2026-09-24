import type { NextRequest } from "next/server";
import { loadSession } from "@/lib/game/session-server";
import { errorJson, json } from "@/lib/http";
import { hostKeyMatches, isUuid } from "@/lib/server-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import type { FeedbackRating } from "@/lib/db/types";

export const runtime = "nodejs";
const RATINGS: FeedbackRating[] = ["excellent", "too_easy", "too_hard", "unclear", "needs_review"];

/** تقييم المضيف للسؤال (يظهر في لوحة الإدارة للمراجعة) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return errorJson("جلسة غير صالحة", 404);
  const body = (await req.json().catch(() => ({}))) as { questionId?: unknown; rating?: unknown; note?: unknown };
  if (!isUuid(body.questionId) || !RATINGS.includes(body.rating as FeedbackRating)) return errorJson("تقييم غير صالح");

  const sb = getServiceSupabase();
  const row = await loadSession(sb, id);
  if (!row) return errorJson("الجلسة غير موجودة", 404);
  if (!hostKeyMatches(req, row.host_key_hash)) return errorJson("مفتاح المضيف غير صحيح", 403);
  if (!row.state.questions[body.questionId as string]) return errorJson("السؤال ليس ضمن هذه اللعبة");

  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null;
  const { error } = await sb.from("question_feedback").insert({ question_id: body.questionId, rating: body.rating, note });
  if (error) return errorJson(error.message, 500);
  return json({ ok: true });
}
