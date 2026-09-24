import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { getPublicSupabase } from "@/lib/supabase/public";
import { packIsLive, type GamePack } from "@/lib/db/types";
import { LEVELS } from "@/lib/game/constants";

export const metadata: Metadata = { title: "الباقات الجاهزة" };
export const revalidate = 120;

export default async function PacksPage() {
  let packs: GamePack[] = [];
  try {
    const { data } = await getPublicSupabase().from("game_packs").select("*").eq("is_active", true).order("sort_order");
    packs = ((data ?? []) as GamePack[]).filter((p) => packIsLive(p));
  } catch {
    /* بدون اتصال */
  }
  const seasonal = packs.filter((p) => p.is_seasonal);
  const regular = packs.filter((p) => !p.is_seasonal);

  const Card = ({ p }: { p: GamePack }) => (
    <Link href={`/play/new?pack=${p.slug}`} className="panel group flex flex-col gap-3 p-5 transition hover:border-gold-400/50">
      <div className="flex items-start justify-between">
        <span className="text-5xl">{p.emoji}</span>
        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">{LEVELS.find((l) => l.id === p.level)?.name}</span>
      </div>
      <div>
        <h2 className="font-display text-2xl font-extrabold group-hover:text-gold-300">{p.name}</h2>
        {p.description && <p className="text-sm text-white/60">{p.description}</p>}
      </div>
      <div className="mt-auto flex gap-2 text-xs text-white/50">
        <span>{p.category_count} فئات</span>
        {p.family_mode && <span>👨‍👩‍👧 عائلي</span>}
        {p.season_label && <span>🗓️ {p.season_label}</span>}
      </div>
    </Link>
  );

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl space-y-10 px-5 pb-20">
        <div className="space-y-2">
          <h1 className="font-display text-5xl font-extrabold">الباقات الجاهزة</h1>
          <p className="text-white/60">اختار باقة وابدأ مباشرة — الفئات محددة مسبقًا.</p>
        </div>
        {seasonal.length > 0 && (
          <section className="space-y-4">
            <h2 className="font-display text-2xl font-bold">🌙 باقات الموسم</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {seasonal.map((p) => (
                <Card key={p.id} p={p} />
              ))}
            </div>
          </section>
        )}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {regular.map((p) => (
            <Card key={p.id} p={p} />
          ))}
        </section>
        {packs.length === 0 && <p className="text-white/50">لا توجد باقات متاحة حاليًا. أضفها من لوحة الإدارة.</p>}
      </main>
    </>
  );
}
