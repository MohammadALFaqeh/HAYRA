import type { NextRequest } from "next/server";
import { hostPayload, loadSession } from "@/lib/game/session-server";
import { errorJson, json } from "@/lib/http";
import { hostKeyMatches, isUuid } from "@/lib/server-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** الحالة الكاملة للمضيف (تحتوي الإجابات) — تتطلب مفتاح المضيف */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return errorJson("جلسة غير صالحة", 404);
  const sb = getServiceSupabase();
  const row = await loadSession(sb, id);
  if (!row) return errorJson("انتهت هذه الجلسة أو لم تعد موجودة", 404);
  if (!hostKeyMatches(req, row.host_key_hash)) return errorJson("مفتاح المضيف غير صحيح", 403);
  const { count } = await sb.from("session_events").select("id", { count: "exact", head: true }).eq("session_id", id);
  return json(hostPayload(row, (count ?? 0) > 0));
}
