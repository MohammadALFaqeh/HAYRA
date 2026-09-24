import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import type { Category } from "@/lib/db/types";
import { FEEDBACK_LABELS, type FeedbackRating } from "@/lib/db/types";
import { DIFFICULTY_LABELS, POINT_ROWS } from "@/lib/game/constants";
import { FeedbackActions } from "@/components/admin/FeedbackActions";
import { cn } from "@/lib/utils";

interface CoverageRow {
  category_id: string;
  difficulty: number;
  active: number;
  inactive: number;
  unverified: number;
}

export default async function AdminDashboard() {
  const sb = await getServerSupabase();
  const head = { count: "exact" as const, head: true };
  const [total, active, unverified, blacklisted, inactive, cats, coverage, feedback] = await Promise.all([
    sb.from("questions").select("id", head),
    sb.from("questions").select("id", head).eq("is_active", true).eq("is_blacklisted", false),
    sb.from("questions").select("id", head).eq("verified", false),
    sb.from("questions").select("id", head).eq("is_blacklisted", true),
    sb.from("questions").select("id", head).eq("is_active", false),
    sb.from("categories").select("*").order("sort_order"),
    sb.rpc("admin_coverage"),
    sb
      .from("question_feedback")
      .select("id,rating,note,created_at,question:questions(id,question_text,difficulty)")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const categories = (cats.data ?? []) as Category[];
  const cov = (coverage.data ?? []) as CoverageRow[];
  const cell = (catId: string, d: number) => cov.find((r) => r.category_id === catId && Number(r.difficulty) === d);

  const stats = [
    { label: "كل الأسئلة", value: total.count ?? 0, href: "/admin/questions" },
    { label: "مفعّلة", value: active.count ?? 0, href: "/admin/questions?active=true" },
    { label: "غير مفعّلة (مراجعة)", value: inactive.count ?? 0, href: "/admin/questions?active=false" },
    { label: "غير موثّقة", value: unverified.count ?? 0, href: "/admin/questions?verified=false" },
    { label: "محظورة", value: blacklisted.count ?? 0, href: "/admin/questions?blacklisted=true" },
  ];

  type FB = { id: number; rating: FeedbackRating; note: string | null; created_at: string; question: { id: string; question_text: string; difficulty: number } | null };
  const fb = (feedback.data ?? []) as unknown as FB[];

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-extrabold">لوحة الإدارة</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="panel p-4 hover:border-gold-400/40">
            <div className="font-display text-3xl font-extrabold text-gold-300">{s.value}</div>
            <div className="text-sm text-white/60">{s.label}</div>
          </Link>
        ))}
      </div>

      <section className="panel space-y-3 p-4">
        <h2 className="font-display text-xl font-bold">تغطية البنك (أسئلة مفعّلة لكل مستوى)</h2>
        <p className="text-sm text-white/50">كل لعبة تحتاج سؤالًا واحدًا على الأقل لكل خانة. الأحمر = لا يوجد، البرتقالي = أقل من 5. الرقم الصغير = غير المفعّل.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-center text-sm">
            <thead>
              <tr className="text-white/50">
                <th className="p-2 text-right">الفئة</th>
                {POINT_ROWS.map((p, i) => (
                  <th key={p} className="p-2" title={DIFFICULTY_LABELS[i + 1]}>
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-t border-white/[0.06]">
                  <td className="p-2 text-right font-semibold">
                    {c.icon} {c.name}
                  </td>
                  {POINT_ROWS.map((_, i) => {
                    const r = cell(c.id, i + 1);
                    const n = Number(r?.active ?? 0);
                    return (
                      <td key={i} className="p-1">
                        <Link
                          href={`/admin/questions?category=${c.id}&difficulty=${i + 1}`}
                          className={cn(
                            "block rounded-lg py-1.5 font-bold",
                            n === 0 ? "bg-wine-500/30 text-wine-400" : n < 5 ? "bg-ember-500/20 text-ember-400" : "bg-leaf-500/15 text-leaf-400",
                          )}
                        >
                          {n}
                          {Number(r?.inactive ?? 0) > 0 && <sub className="ms-1 text-white/40">{r!.inactive}</sub>}
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel space-y-3 p-4">
        <h2 className="font-display text-xl font-bold">آخر تقييمات المضيفين</h2>
        {fb.length === 0 && <p className="text-white/50">لا توجد تقييمات بعد.</p>}
        <ul className="divide-y divide-white/[0.06]">
          {fb.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", f.rating === "excellent" ? "bg-leaf-500/20" : "bg-ember-500/20")}>
                {FEEDBACK_LABELS[f.rating]}
              </span>
              <Link href={f.question ? `/admin/questions/${f.question.id}` : "#"} className="min-w-0 flex-1 truncate hover:text-gold-300">
                {f.question?.question_text ?? "(سؤال محذوف)"}
              </Link>
              <span className="text-xs text-white/40">{new Date(f.created_at).toLocaleDateString("ar")}</span>
              <FeedbackActions id={f.id} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
