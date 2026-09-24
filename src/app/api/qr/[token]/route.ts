import type { NextRequest } from "next/server";
import { QUESTION_TYPES } from "@/lib/game/constants";
import type { GameState } from "@/lib/game/types";
import { json } from "@/lib/http";
import { getServiceSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QrStatus = "ok" | "expired" | "claimed";

/**
 * صفحة تحدي QR تستدعي هذا المسار.
 * - الرمز مرتبط بالجلسة والسؤال، ولا يحتوي الإجابة في الرابط
 * - يُفتح على جهاز واحد فقط (deviceId)
 * - يصبح غير صالح بمجرد انتهاء السؤال
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const device = req.nextUrl.searchParams.get("device") ?? "";
  const expired = () => json({ status: "expired" as QrStatus });
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token) || !/^[A-Za-z0-9_-]{8,64}$/.test(device)) return expired();

  const sb = getServiceSupabase();
  const { data: tok } = await sb.from("qr_tokens").select("*").eq("token", token).maybeSingle();
  if (!tok || new Date(tok.expires_at).getTime() < Date.now()) return expired();

  const { data: session } = await sb.from("game_sessions").select("state").eq("id", tok.session_id).maybeSingle();
  const state = session?.state as GameState | undefined;
  const a = state?.active;
  if (!state || !a || a.qrToken !== token || a.stage === "resolved" || a.stage === "revealed") return expired();

  // ربط الرمز بأول جهاز يفتحه
  if (!tok.claimed_by) {
    const { data: claimed } = await sb
      .from("qr_tokens")
      .update({ claimed_by: device, claimed_at: new Date().toISOString() })
      .eq("token", token)
      .is("claimed_by", null)
      .select("claimed_by");
    if (!claimed?.length) {
      const { data: again } = await sb.from("qr_tokens").select("claimed_by").eq("token", token).maybeSingle();
      if (again?.claimed_by !== device) return json({ status: "claimed" as QrStatus });
    }
  } else if (tok.claimed_by !== device) {
    return json({ status: "claimed" as QrStatus });
  }

  const q = state.questions[a.questionId];
  if (!q) return expired();
  const team = state.teams[a.answeringTeam];
  return json({
    status: "ok" as QrStatus,
    challenge: {
      type: q.type,
      typeName: QUESTION_TYPES[q.type]?.name ?? "تحدي",
      prompt: q.text,
      secret: q.answer,
      instructions: q.extra?.instructions ?? null,
      forbidden: q.extra?.forbidden ?? [],
      clues: q.clues ?? [],
      imageUrl: q.imageUrl,
      audioUrl: q.audioUrl,
      teamName: team?.name ?? "",
      teamId: a.answeringTeam,
      points: a.basePoints * a.multiplier,
    },
    timer: state.timer,
    serverTime: Date.now(),
  });
}
