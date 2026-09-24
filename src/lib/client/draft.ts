"use client";
import { DEFAULT_SETTINGS } from "@/lib/game/constants";
import type { GameSettings } from "@/lib/game/types";
import { readDraft, setHostKey, writeDraft } from "./storage";

export interface GameDraft {
  teams: [string, string];
  settings: GameSettings;
  categoryCount: number;
  packSlug: string | null;
  packName: string | null;
  columns: { categoryId: string; subcategoryId: string | null }[];
}

export const emptyDraft = (): GameDraft => ({
  teams: ["", ""],
  settings: { ...DEFAULT_SETTINGS },
  categoryCount: 6,
  packSlug: null,
  packName: null,
  columns: [],
});

export const loadDraft = (): GameDraft => ({ ...emptyDraft(), ...(readDraft<GameDraft>() ?? {}) });
export const saveDraft = (d: GameDraft) => writeDraft(d);

/** ينشئ اللعبة على السيرفر ويحفظ مفتاح المضيف على هذا الجهاز */
export async function createGame(d: GameDraft): Promise<{ sessionId: string } | { error: string }> {
  try {
    const res = await fetch("/api/game/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teams: d.teams,
        settings: d.settings,
        packSlug: d.packSlug,
        columns: d.packSlug ? undefined : d.columns,
      }),
    });
    const data = (await res.json()) as { sessionId?: string; hostKey?: string; error?: string };
    if (res.status === 401) {
      window.location.href = "/login?next=/play/new";
      return { error: "انتهت صلاحية الدخول" };
    }
    if (!res.ok || !data.sessionId || !data.hostKey) return { error: data.error ?? "تعذر إنشاء اللعبة" };
    setHostKey(data.sessionId, data.hostKey);
    return { sessionId: data.sessionId };
  } catch {
    return { error: "تحقق من الاتصال بالإنترنت" };
  }
}
