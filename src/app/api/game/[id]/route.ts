import type { NextRequest } from "next/server";
import { loadSession } from "@/lib/game/session-server";
import { errorJson, json } from "@/lib/http";
import { hostKeyMatches, isUuid } from "@/lib/server-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** حذف الجلسة عند انتهاء اللعبة — نرسل أولًا حالة "closed" ليعرف التلفزيون */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return errorJson("جلسة غير صالحة", 404);
  const sb = getServiceSupabase();
  const row = await loadSession(sb, id);
  if (!row) return json({ ok: true });
  if (!hostKeyMatches(req, row.host_key_hash)) return errorJson("مفتاح المضيف غير صحيح", 403);

  await sb
    .from("session_public")
    .update({ state: { v: 1, sessionId: id, phase: "closed" }, updated_at: new Date().toISOString() })
    .eq("session_id", id);
  // مهلة قصيرة ليصل حدث الإغلاق عبر Realtime قبل الحذف
  await new Promise((r) => setTimeout(r, 600));
  await sb.from("game_sessions").delete().eq("id", id);
  return json({ ok: true });
}
