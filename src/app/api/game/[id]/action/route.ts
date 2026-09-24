import type { NextRequest } from "next/server";
import { UNDO_HISTORY_LIMIT } from "@/lib/game/constants";
import { applyAction, NON_UNDOABLE, rebaseTimerForUndo } from "@/lib/game/engine";
import { hostPayload, loadSession, nextExpiry, publishPublic, syncQrTokens } from "@/lib/game/session-server";
import { GameRuleError, type GameState } from "@/lib/game/types";
import { parseAction } from "@/lib/game/validate";
import { errorJson, json } from "@/lib/http";
import { hostKeyMatches, isUuid, randomKey } from "@/lib/server-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return errorJson("جلسة غير صالحة", 404);

  let body: { action?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorJson("طلب غير صالح");
  }
  const action = parseAction(body.action);
  if (!action) return errorJson("إجراء غير صالح");

  const sb = getServiceSupabase();

  // محاولة حتى 4 مرات في حال تعارض التعديلات (Optimistic Concurrency عبر rev)
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await loadSession(sb, id);
    if (!row) return errorJson("انتهت هذه الجلسة أو لم تعد موجودة", 404);
    if (!hostKeyMatches(req, row.host_key_hash)) return errorJson("مفتاح المضيف غير صحيح", 403);

    const now = Date.now();
    let next: GameState;
    let undoEventId: number | null = null;

    if (action.type === "UNDO") {
      const { data: ev } = await sb
        .from("session_events")
        .select("id,prev_state,created_at")
        .eq("session_id", id)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!ev) return errorJson("لا يوجد إجراء للتراجع عنه", 409);
      undoEventId = ev.id as number;
      next = rebaseTimerForUndo(ev.prev_state as GameState, new Date(ev.created_at as string).getTime(), now, row.state.eventSeq);
    } else {
      try {
        next = applyAction(row.state, action, { now, random: Math.random, newQrToken: () => randomKey(18) });
      } catch (e) {
        if (e instanceof GameRuleError) return errorJson(e.message, 409, hostPayload(row, true));
        throw e;
      }
    }

    const { data: updated, error } = await sb
      .from("game_sessions")
      .update({ state: next, rev: row.rev + 1, updated_at: new Date().toISOString(), expires_at: nextExpiry() })
      .eq("id", id)
      .eq("rev", row.rev)
      .select("rev");
    if (error) return errorJson(error.message, 500);
    if (!updated?.length) continue; // تعارض → أعد المحاولة

    if (undoEventId !== null) {
      await sb.from("session_events").delete().eq("id", undoEventId);
    } else if (!NON_UNDOABLE.includes(action.type as (typeof NON_UNDOABLE)[number])) {
      await sb.from("session_events").insert({
        session_id: id,
        action_type: action.type,
        payload: action,
        prev_state: row.state,
      });
      // الاحتفاظ بآخر N إجراء فقط
      const { data: old } = await sb
        .from("session_events")
        .select("id")
        .eq("session_id", id)
        .order("id", { ascending: false })
        .range(UNDO_HISTORY_LIMIT, UNDO_HISTORY_LIMIT + 50);
      if (old?.length) await sb.from("session_events").delete().in("id", old.map((o) => o.id));
    }

    await Promise.all([publishPublic(sb, next), syncQrTokens(sb, next)]);
    const { count } = await sb.from("session_events").select("id", { count: "exact", head: true }).eq("session_id", id);
    return json(hostPayload({ rev: row.rev + 1, state: next }, (count ?? 0) > 0));
  }
  return errorJson("الجلسة مشغولة، حاول مرة أخرى", 409);
}
