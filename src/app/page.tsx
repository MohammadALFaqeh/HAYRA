import Image from "next/image";
import Link from "next/link";
import { getPublicSupabase } from "@/lib/supabase/public";
import type { Category } from "@/lib/db/types";
import { colorOf } from "@/lib/utils";
import { SiteHeader } from "@/components/site/SiteHeader";
import { ResumeBanner } from "@/components/site/ResumeBanner";

export const revalidate = 300;

async function getCategories(): Promise<Category[]> {
  try {
    const { data } = await getPublicSupabase().from("categories").select("*").eq("is_active", true).order("sort_order");
    return (data ?? []) as Category[];
  } catch {
    return [];
  }
}

export default async function Home() {
  const categories = await getCategories();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-6xl flex-col gap-14 px-5 pb-20">
        <ResumeBanner />

        {/* البطل: الشعار على المسرح + لوحة مضيئة */}
        <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div className="relative mx-auto aspect-square w-full max-w-[520px]">
            <Image
              src="/brand/logo-stage.webp"
              alt="حيرة"
              fill
              priority
              sizes="(max-width: 1024px) 90vw, 520px"
              className="object-contain [mask-image:radial-gradient(circle,black_55%,transparent_72%)]"
            />
          </div>
          <div className="space-y-6 text-center lg:text-right">
            <h1 className="font-display text-5xl font-extrabold leading-[1.15] lg:text-7xl">
              فريقين، لوحة أسئلة،
              <br />
              <span className="gold-text">وحيرة كبيرة.</span>
            </h1>
            <p className="mx-auto max-w-md text-lg text-white/70 lg:mx-0">
              اعرضوا اللعبة على التلفزيون، وتحكّموا بكل شيء من الجوال. أسئلة بقيم 100 و300 و500، سرقة، وسائل مساعدة، خانات غامضة، وتحديات QR.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Link href="/play/new" className="rounded-[1.4rem] bg-gradient-to-b from-gold-300 to-gold-500 px-8 py-4 text-center font-display text-xl font-extrabold text-night-950 shadow-gold transition hover:brightness-110">
                ابدأ لعبة
              </Link>
              <Link href="/packs" className="rounded-[1.4rem] border border-white/15 bg-white/[0.05] px-8 py-4 text-center font-display text-xl font-bold hover:bg-white/10">
                باقات جاهزة
              </Link>
            </div>
            <Link href="/how-to-play" className="inline-block text-sm text-volt-400 hover:underline">
              أول مرة؟ شوف طريقة اللعب
            </Link>
          </div>
        </section>

        {/* الفئات */}
        {categories.length > 0 && (
          <section className="space-y-5">
            <h2 className="font-display text-3xl font-extrabold">الفئات</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {categories.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start gap-3 rounded-tile border-b-4 bg-night-800/80 p-4"
                  style={{ borderColor: colorOf(c.color).hex }}
                >
                  <span className="text-3xl">{c.icon}</span>
                  <div className="min-w-0">
                    <div className="font-display text-lg font-bold">{c.name}</div>
                    {c.description && <div className="line-clamp-2 text-xs text-white/50">{c.description}</div>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
