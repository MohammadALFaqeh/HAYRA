"use client";
import { useEffect, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { PublicState } from "@/lib/game/public";
import { hintServerTime } from "./clock";

export type PublicStatus = "loading" | "live" | "polling" | "closed" | "missing";

/**
 * يقرأ الحالة العامة للجلسة (بدون إجابات) ويستمع للتحديثات عبر Supabase Realtime،
 * مع استطلاع احتياطي كل 4 ثوانٍ إذا انقطع الاتصال اللحظي.
 */
export function usePublicSession(sessionId: string) {
  const [state, setState] = useState<PublicState | null>(null);
  const [status, setStatus] = useState<PublicStatus>("loading");
  const lastUpdated = useRef(0);

  useEffect(() => {
    const sb = getBrowserSupabase();
    let alive = true;
    let live = false;

    const accept = (s: PublicState | null | undefined) => {
      if (!alive) return;
      if (!s) {
        setStatus((cur) => (cur === "loading" ? "missing" : "closed"));
        return;
      }
      if (s.phase === "closed") {
        setStatus("closed");
        return;
      }
      if (s.updatedAt < lastUpdated.current) return; // تحديث قديم
      lastUpdated.current = s.updatedAt;
      hintServerTime(s.serverTime);
      setState(s);
      setStatus(live ? "live" : "polling");
    };

    const fetchOnce = async () => {
      const { data, error } = await sb.from("session_public").select("state").eq("session_id", sessionId).maybeSingle();
      if (error) return;
      accept((data?.state as PublicState) ?? null);
    };

    void fetchOnce();
    const channel = sb
      .channel(`session:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_public", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          if (payload.eventType === "DELETE") return accept(null);
          accept((payload.new as { state: PublicState }).state);
        },
      )
      .subscribe((s) => {
        live = s === "SUBSCRIBED";
        if (live) void fetchOnce();
        setStatus((cur) => (cur === "closed" || cur === "missing" || cur === "loading" ? cur : live ? "live" : "polling"));
      });

    const poll = setInterval(() => {
      if (!live) void fetchOnce();
    }, 4000);
    const safety = setInterval(fetchOnce, 30000);

    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(safety);
      void sb.removeChannel(channel);
    };
  }, [sessionId]);

  return { state, status };
}
