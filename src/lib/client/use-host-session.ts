"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyAction } from "@/lib/game/engine";
import { GameRuleError, type GameAction, type GameState } from "@/lib/game/types";
import { hintServerTime, serverNow } from "./clock";
import { forgetSession, getHostKey, setHostKey } from "./storage";

export type HostAction = GameAction | { type: "UNDO" };
export type HostStatus = "loading" | "ready" | "no-key" | "missing" | "forbidden";

interface HostPayload {
  rev: number;
  state: GameState;
  canUndo: boolean;
  serverTime: number;
  error?: string;
}

const queueKey = (id: string) => `hayra:queue:${id}`;
const loadQueue = (id: string): GameAction[] => {
  try {
    return JSON.parse(localStorage.getItem(queueKey(id)) ?? "[]");
  } catch {
    return [];
  }
};
const saveQueue = (id: string, q: GameAction[]) => {
  try {
    if (q.length) localStorage.setItem(queueKey(id), JSON.stringify(q));
    else localStorage.removeItem(queueKey(id));
  } catch {
    /* ignore */
  }
};

/**
 * جلسة المضيف:
 * - تحديث فوري (Optimistic) باستخدام نفس محرك السيرفر
 * - طابور أوفلاين: إذا انقطع الإنترنت تُحفظ الإجراءات وتُرسل عند عودة الاتصال
 * - السيرفر هو المرجع النهائي دائمًا
 */
export function useHostSession(sessionId: string) {
  const [state, setState] = useState<GameState | null>(null);
  const [status, setStatus] = useState<HostStatus>("loading");
  const [canUndo, setCanUndo] = useState(false);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);
  const queue = useRef<GameAction[]>([]);
  const flushing = useRef(false);
  const stateRef = useRef<GameState | null>(null);
  stateRef.current = state;

  const headers = useCallback(
    () => ({ "Content-Type": "application/json", "x-host-key": keyRef.current ?? "" }),
    [],
  );

  const adopt = useCallback((p: HostPayload) => {
    hintServerTime(p.serverTime);
    // نعيد تطبيق ما تبقى في الطابور فوق حالة السيرفر
    let s = p.state;
    for (const a of queue.current) {
      try {
        s = applyAction(s, a, { now: serverNow(), random: Math.random });
      } catch {
        /* سيُرفض من السيرفر أيضًا */
      }
    }
    setState(s);
    setCanUndo(p.canUndo);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/game/${sessionId}/host`, { headers: headers(), cache: "no-store" });
      if (res.status === 404) return setStatus("missing");
      if (res.status === 403) return setStatus("forbidden");
      if (!res.ok) throw new Error();
      const p = (await res.json()) as HostPayload;
      setOnline(true);
      adopt(p);
      setStatus("ready");
    } catch {
      setOnline(false);
    }
  }, [sessionId, headers, adopt]);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      while (queue.current.length) {
        const action = queue.current[0];
        let res: Response;
        try {
          res = await fetch(`/api/game/${sessionId}/action`, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({ action }),
          });
        } catch {
          setOnline(false);
          return; // يعاد المحاولة لاحقًا
        }
        setOnline(true);
        const p = (await res.json().catch(() => ({}))) as HostPayload;
        queue.current.shift();
        saveQueue(sessionId, queue.current);
        setPending(queue.current.length);
        if (res.status === 404) return setStatus("missing");
        if (!res.ok) {
          setError(p.error ?? "تعذر تنفيذ الإجراء");
          if (p.state) adopt(p);
          else await load();
          continue;
        }
        adopt(p);
      }
    } finally {
      flushing.current = false;
    }
  }, [sessionId, headers, adopt, load]);

  // ------- التهيئة: قراءة المفتاح من الرابط (#k=) أو من التخزين
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const fromUrl = hash.get("k");
    if (fromUrl) {
      setHostKey(sessionId, fromUrl);
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    keyRef.current = fromUrl ?? getHostKey(sessionId);
    if (!keyRef.current) {
      setStatus("no-key");
      return;
    }
    queue.current = loadQueue(sessionId);
    setPending(queue.current.length);
    void load().then(() => flush());
  }, [sessionId, load, flush]);

  // ------- إعادة المحاولة عند عودة الاتصال
  useEffect(() => {
    const retry = () => {
      void load().then(() => flush());
    };
    const onVis = () => document.visibilityState === "visible" && retry();
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", onVis);
    const i = setInterval(() => {
      if (queue.current.length) void flush();
    }, 3000);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(i);
    };
  }, [load, flush]);

  const dispatch = useCallback(
    async (action: HostAction) => {
      setError(null);
      const cur = stateRef.current;
      if (!cur) return false;
      if (action.type === "UNDO") {
        if (queue.current.length) {
          setError("انتظر حتى تُرسل الإجراءات المعلقة");
          return false;
        }
        try {
          const res = await fetch(`/api/game/${sessionId}/action`, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({ action }),
          });
          const p = (await res.json()) as HostPayload;
          if (!res.ok) {
            setError(p.error ?? "تعذر التراجع");
            return false;
          }
          adopt(p);
          return true;
        } catch {
          setOnline(false);
          setError("التراجع يحتاج اتصال إنترنت");
          return false;
        }
      }
      // تحقق وتطبيق محلي فوري
      try {
        const next = applyAction(cur, action, { now: serverNow(), random: Math.random });
        setState(next);
      } catch (e) {
        if (e instanceof GameRuleError) {
          setError(e.message);
          return false;
        }
        throw e;
      }
      queue.current.push(action);
      saveQueue(sessionId, queue.current);
      setPending(queue.current.length);
      void flush();
      return true;
    },
    [sessionId, headers, adopt, flush],
  );

  const endSession = useCallback(async () => {
    try {
      await fetch(`/api/game/${sessionId}`, { method: "DELETE", headers: headers() });
    } catch {
      /* ستُحذف تلقائيًا بعد 12 ساعة */
    }
    forgetSession(sessionId);
  }, [sessionId, headers]);

  const sendFeedback = useCallback(
    async (questionId: string, rating: string, note?: string) => {
      const res = await fetch(`/api/game/${sessionId}/feedback`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ questionId, rating, note }),
      }).catch(() => null);
      return !!res?.ok;
    },
    [sessionId, headers],
  );

  const resetQr = useCallback(async () => {
    const res = await fetch(`/api/game/${sessionId}/qr-reset`, { method: "POST", headers: headers() }).catch(() => null);
    return !!res?.ok;
  }, [sessionId, headers]);

  return {
    state,
    status,
    canUndo,
    online,
    pending,
    error,
    clearError: () => setError(null),
    dispatch,
    endSession,
    sendFeedback,
    resetQr,
    hostKey: () => keyRef.current,
    reload: load,
  };
}
