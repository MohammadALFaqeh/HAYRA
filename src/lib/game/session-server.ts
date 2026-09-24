import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { QR_TOKEN_TTL_MINUTES, SESSION_TTL_HOURS } from "./constants";
import { toPublicState } from "./public";
import type { GameState } from "./types";

export interface SessionRow {
  id: string;
  host_key_hash: string;
  rev: number;
  state: GameState;
  expires_at: string;
}

export async function loadSession(sb: SupabaseClient, id: string): Promise<SessionRow | null> {
  const { data, error } = await sb
    .from("game_sessions")
    .select("id,host_key_hash,rev,state,expires_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data as SessionRow;
}

export const nextExpiry = () => new Date(Date.now() + SESSION_TTL_HOURS * 3600_000).toISOString();

/** ينشر النسخة العامة (للتلفزيون والجمهور) — يُطلق Realtime */
export async function publishPublic(sb: SupabaseClient, state: GameState) {
  const { error } = await sb
    .from("session_public")
    .upsert({ session_id: state.sessionId, state: toPublicState(state), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/**
 * يزامن رموز QR: ينشئ رمز السؤال الحالي إن وُجد، ويحذف أي رمز آخر للجلسة
 * (فيصبح الرابط القديم غير صالح → "انتهت هذه الجولة").
 */
export async function syncQrTokens(sb: SupabaseClient, state: GameState) {
  const a = state.active;
  const current = a?.qrToken && a.stage !== "resolved" && a.stage !== "revealed" ? a.qrToken : null;
  if (current) {
    await sb.from("qr_tokens").upsert(
      {
        token: current,
        session_id: state.sessionId,
        cell_key: a!.cellKey,
        question_id: a!.questionId,
        expires_at: new Date(Date.now() + QR_TOKEN_TTL_MINUTES * 60_000).toISOString(),
      },
      { onConflict: "token", ignoreDuplicates: true },
    );
    await sb.from("qr_tokens").delete().eq("session_id", state.sessionId).neq("token", current);
  } else {
    await sb.from("qr_tokens").delete().eq("session_id", state.sessionId);
  }
}

/** بيانات المضيف: الحالة الكاملة (تشمل الإجابات) */
export function hostPayload(row: { rev: number; state: GameState }, canUndo: boolean) {
  return { rev: row.rev, state: row.state, canUndo, serverTime: Date.now() };
}
