import type { NextRequest } from "next/server";
import { loadSession } from "@/lib/game/session-server";
import { errorJson, json } from "@/lib/http";
import { hostKeyMatches, isUuid } from "@/lib/server-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** يسمح للمضيف بإعادة فتح رمز QR على جهاز آخر (إذا مسحه الشخص الخطأ) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return errorJson("جلسة غير صالحة", 404);
  const sb = getServiceSupabase();
  const row = await loadSession(sb, id);
  if (!row) return errorJson("الجلسة غير موجودة", 404);
  if (!hostKeyMatches(req, row.host_key_hash)) return errorJson("مفتاح المضيف غير صحيح", 403);
  const token = row.state.active?.qrToken;
  if (!token) return errorJson("لا يوجد تحدي QR مفتوح");
  await sb.from("qr_tokens").update({ claimed_by: null, claimed_at: null }).eq("token", token);
  return json({ ok: true });
}
