"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Shuffle } from "lucide-react";
import { Button } from "@/components/ui";
import { WizardSteps } from "@/components/site/WizardSteps";
import { emptyDraft, loadDraft, saveDraft, type GameDraft } from "@/lib/client/draft";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { TEAM_NAME_IDEAS } from "@/lib/game/constants";
import type { GamePack } from "@/lib/db/types";
import { cn } from "@/lib/utils";

export function TeamsStep() {
  const router = useRouter();
  const params = useSearchParams();
  const [draft, setDraft] = useState<GameDraft | null>(null);

  useEffect(() => {
    const packSlug = params.get("pack");
    const d = packSlug ? { ...emptyDraft(), teams: loadDraft().teams } : loadDraft();
    if (!packSlug) {
      d.packSlug = null;
      d.packName = null;
      setDraft(d);
      return;
    }
    void getBrowserSupabase()
      .from("game_packs")
      .select("*")
      .eq("slug", packSlug)
      .maybeSingle()
      .then(({ data }) => {
        const p = data as GamePack | null;
        if (p) {
          d.packSlug = p.slug;
          d.packName = `${p.emoji} ${p.name}`;
          d.settings = { ...d.settings, level: p.level, familyMode: p.family_mode };
          d.categoryCount = p.category_count;
        }
        setDraft(d);
      });
  }, [params]);

  if (!draft) return null;
  const setTeam = (i: 0 | 1, v: string) => {
    const teams = [...draft.teams] as [string, string];
    teams[i] = v;
    setDraft({ ...draft, teams });
  };
  const randomNames = () => {
    const pool = [...TEAM_NAME_IDEAS].sort(() => Math.random() - 0.5);
    setDraft({ ...draft, teams: [pool[0], pool[1]] });
  };
  const valid = draft.teams[0].trim() && draft.teams[1].trim() && draft.teams[0].trim() !== draft.teams[1].trim();

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-5 pb-20">
      <WizardSteps step={1} pack={!!draft.packSlug} />
      <div className="text-center">
        <h1 className="font-display text-4xl font-extrabold">مين بيتحدى مين؟</h1>
        {draft.packName && <p className="mt-2 text-gold-300">الباقة: {draft.packName}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {([0, 1] as const).map((i) => (
          <label
            key={i}
            className={cn("panel block space-y-3 border-2 p-5", i === 0 ? "border-gold-400/40" : "border-volt-400/40")}
          >
            <span className={cn("font-display text-lg font-bold", i === 0 ? "text-gold-300" : "text-volt-400")}>
              {i === 0 ? "الفريق الأول" : "الفريق الثاني"}
            </span>
            <input
              value={draft.teams[i]}
              maxLength={24}
              onChange={(e) => setTeam(i, e.target.value)}
              placeholder={i === 0 ? "مثال: النسور" : "مثال: الفرسان"}
              className="w-full text-xl font-bold"
            />
          </label>
        ))}
      </div>
      <div className="flex justify-center">
        <Button variant="ghost" icon={<Shuffle className="h-4 w-4" />} onClick={randomNames}>
          أسماء عشوائية
        </Button>
      </div>
      {draft.teams[0].trim() && draft.teams[0].trim() === draft.teams[1].trim() && (
        <p className="text-center text-sm text-wine-400">اختاروا اسمين مختلفين</p>
      )}
      <Button
        size="lg"
        className="w-full"
        disabled={!valid}
        onClick={() => {
          saveDraft({ ...draft, teams: [draft.teams[0].trim(), draft.teams[1].trim()] });
          router.push("/play/new/settings");
        }}
      >
        التالي: الإعدادات
      </Button>
    </main>
  );
}
