"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Ban, CheckCircle2, ChevronLeft, ChevronRight, Plus, Power, PowerOff, Search, Trash2 } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { useTaxonomy } from "@/lib/client/admin-data";
import type { QuestionRow } from "@/lib/db/types";
import { QUESTION_TYPES, QUESTION_TYPE_IDS, TIERS, tierPoints } from "@/lib/game/constants";
import { Badge, Button, Spinner, Toast } from "@/components/ui";
import { cn } from "@/lib/utils";

const PAGE = 50;
type Filters = Record<"q" | "category" | "subcategory" | "tier" | "type" | "verified" | "active" | "blacklisted" | "family" | "batch" | "tag", string>;
const KEYS: (keyof Filters)[] = ["q", "category", "subcategory", "tier", "type", "verified", "active", "blacklisted", "family", "batch", "tag"];

export function QuestionList() {
  const router = useRouter();
  const params = useSearchParams();
  const { cats, subs } = useTaxonomy();
  const filters = useMemo(() => Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? ""])) as Filters, [params]);
  const page = Math.max(0, Number(params.get("page") ?? 0));
  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // تحديد كل الأسئلة المطابقة للفلاتر (كل الصفحات) لا الصفحة الحالية فقط
  const [allMatching, setAllMatching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(filters.q);
  const [msg, setMsg] = useState<string | null>(null);

  const setFilter = (patch: Partial<Filters> & { page?: string }) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v ? sp.set(k, v) : sp.delete(k);
    if (!("page" in patch)) sp.delete("page");
    router.replace(`/admin/questions?${sp}`);
  };

  const query = useCallback(
    (columns: string) => {
      let q = getBrowserSupabase().from("questions").select(columns, { count: "exact" });
      if (filters.q) q = q.or(`question_text.ilike.%${filters.q.replace(/[%,()]/g, " ")}%,answer.ilike.%${filters.q.replace(/[%,()]/g, " ")}%`);
      if (filters.category) q = q.eq("category_id", filters.category);
      if (filters.subcategory) q = q.eq("subcategory_id", filters.subcategory);
      const tier = TIERS.find((t) => String(t.id) === filters.tier);
      if (tier) q = q.in("difficulty", [...tier.difficulties]);
      if (filters.type) q = q.eq("type", filters.type);
      if (filters.verified) q = q.eq("verified", filters.verified === "true");
      if (filters.active) q = q.eq("is_active", filters.active === "true");
      if (filters.blacklisted) q = q.eq("is_blacklisted", filters.blacklisted === "true");
      if (filters.family) q = q.eq("family_safe", filters.family === "true");
      if (filters.batch) q = q.eq("import_batch", filters.batch);
      if (filters.tag) q = q.contains("tags", [filters.tag]);
      return q;
    },
    [filters],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const { data, count: c, error } = await query("*")
      .order("updated_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) setMsg(error.message);
    setRows((data ?? []) as unknown as QuestionRow[]);
    setCount(c ?? 0);
    setSelected(new Set());
    setAllMatching(false);
    setLoading(false);
  }, [query, page]);

  // معرّفات كل الأسئلة المطابقة للفلاتر، على دفعات (حد PostgREST ألف صف للطلب)
  const matchingIds = async () => {
    const ids: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await query("id").order("id").range(from, from + 999);
      if (error) throw error;
      const chunk = (data ?? []) as unknown as { id: string }[];
      ids.push(...chunk.map((r) => r.id));
      if (chunk.length < 1000) return ids;
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  const bulk = async (patch: Partial<QuestionRow> | "delete") => {
    const n = allMatching ? count : selected.size;
    if (!n) return;
    if (patch === "delete" && !confirm(`حذف ${n} سؤال نهائيًا؟`)) return;
    if (patch !== "delete" && allMatching && !confirm(`تطبيق الإجراء على كل الأسئلة المطابقة (${n})؟`)) return;
    setBusy(true);
    try {
      const ids = allMatching ? await matchingIds() : [...selected];
      const sb = getBrowserSupabase();
      // دفعات صغيرة حتى لا يتجاوز رابط الطلب الحد المسموح
      for (let i = 0; i < ids.length; i += 200) {
        const part = ids.slice(i, i + 200);
        const { error } =
          patch === "delete" ? await sb.from("questions").delete().in("id", part) : await sb.from("questions").update(patch).in("id", part);
        if (error) throw error;
      }
      setMsg(patch === "delete" ? `تم حذف ${ids.length}` : `تم تحديث ${ids.length}`);
    } catch (err) {
      setMsg((err as Error).message);
    }
    setBusy(false);
    await load();
  };

  const catName = (id: string) => cats.find((c) => c.id === id);
  const subName = (id: string | null) => subs.find((s) => s.id === id)?.name;
  const pages = Math.ceil(count / PAGE);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold">بنك الأسئلة</h1>
        <Link href="/admin/questions/new">
          <Button icon={<Plus className="h-5 w-5" />}>سؤال جديد</Button>
        </Link>
      </div>

      {/* الفلاتر */}
      <div className="panel grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-6">
        <form
          className="relative sm:col-span-2"
          onSubmit={(e) => {
            e.preventDefault();
            setFilter({ q: search.trim() });
          }}
        >
          <Search className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-white/35" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في السؤال أو الإجابة" className="w-full pr-9" />
        </form>
        <select value={filters.category} onChange={(e) => setFilter({ category: e.target.value, subcategory: "" })}>
          <option value="">كل الفئات</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        <select value={filters.subcategory} onChange={(e) => setFilter({ subcategory: e.target.value })} disabled={!filters.category}>
          <option value="">كل الفرعية</option>
          {subs
            .filter((s) => s.category_id === filters.category)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
        <select value={filters.tier} onChange={(e) => setFilter({ tier: e.target.value })}>
          <option value="">كل المستويات</option>
          {TIERS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.points} — {t.name}
            </option>
          ))}
        </select>
        <select value={filters.type} onChange={(e) => setFilter({ type: e.target.value })}>
          <option value="">كل الأنواع</option>
          {QUESTION_TYPE_IDS.map((t) => (
            <option key={t} value={t}>
              {QUESTION_TYPES[t].name}
            </option>
          ))}
        </select>
        <TriSelect label="التوثيق" value={filters.verified} yes="موثّق" no="غير موثّق" onChange={(v) => setFilter({ verified: v })} />
        <TriSelect label="التفعيل" value={filters.active} yes="مفعّل" no="غير مفعّل" onChange={(v) => setFilter({ active: v })} />
        <TriSelect label="الحظر" value={filters.blacklisted} yes="محظور" no="غير محظور" onChange={(v) => setFilter({ blacklisted: v })} />
        <TriSelect label="العائلي" value={filters.family} yes="آمن عائليًا" no="غير عائلي" onChange={(v) => setFilter({ family: v })} />
        <input placeholder="وسم (tag)" defaultValue={filters.tag} onBlur={(e) => setFilter({ tag: e.target.value.trim() })} />
        <input placeholder="دفعة استيراد" defaultValue={filters.batch} onBlur={(e) => setFilter({ batch: e.target.value.trim() })} dir="ltr" />
      </div>

      {/* إجراءات جماعية */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-white/60">
          {count} سؤال {(allMatching || selected.size > 0) && `— محدد ${allMatching ? count : selected.size}`}
        </span>
        {!allMatching && rows.length > 0 && selected.size === rows.length && count > rows.length && (
          <button type="button" className="font-semibold text-gold-300 hover:underline" onClick={() => setAllMatching(true)}>
            تحديد كل الـ{count} المطابقة
          </button>
        )}
        {allMatching && (
          <button
            type="button"
            className="font-semibold text-white/60 hover:underline"
            onClick={() => {
              setAllMatching(false);
              setSelected(new Set());
            }}
          >
            إلغاء التحديد
          </button>
        )}
        {busy && <Spinner />}
        {(allMatching || selected.size > 0) && !busy && (
          <>
            <Button size="sm" variant="success" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => bulk({ verified: true })}>
              توثيق
            </Button>
            <Button size="sm" variant="soft" icon={<Power className="h-4 w-4" />} onClick={() => bulk({ is_active: true })}>
              تفعيل
            </Button>
            <Button size="sm" variant="soft" icon={<PowerOff className="h-4 w-4" />} onClick={() => bulk({ is_active: false })}>
              تعطيل
            </Button>
            <Button size="sm" variant="soft" icon={<Ban className="h-4 w-4" />} onClick={() => bulk({ is_blacklisted: true })}>
              حظر
            </Button>
            <Button size="sm" variant="soft" onClick={() => bulk({ is_blacklisted: false })}>
              إلغاء الحظر
            </Button>
            <Button size="sm" variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => bulk("delete")}>
              حذف
            </Button>
          </>
        )}
      </div>

      {/* الجدول */}
      <div className="panel overflow-x-auto">
        {loading ? (
          <div className="grid place-items-center p-10">
            <Spinner />
          </div>
        ) : (
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-white/50">
              <tr>
                <th className="w-10 p-3">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={(e) => {
                      setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set());
                      setAllMatching(false);
                    }}
                  />
                </th>
                <th className="p-3 text-right">السؤال</th>
                <th className="p-3 text-right">الإجابة</th>
                <th className="p-3">الفئة</th>
                <th className="p-3">القيمة</th>
                <th className="p-3">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const c = catName(r.category_id);
                return (
                  <tr key={r.id} className={cn("border-t border-white/[0.06] hover:bg-white/[0.03]", !r.is_active && "opacity-60")}>
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={(e) => {
                          const n = new Set(selected);
                          e.target.checked ? n.add(r.id) : n.delete(r.id);
                          setSelected(n);
                          setAllMatching(false);
                        }}
                      />
                    </td>
                    <td className="max-w-md p-3">
                      <Link href={`/admin/questions/${r.id}`} className="line-clamp-2 font-semibold hover:text-gold-300">
                        {r.question_text}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge>{QUESTION_TYPES[r.type]?.name}</Badge>
                        {r.language !== "ar" && <Badge className="bg-ember-500/20">{r.language}</Badge>}
                        {r.import_source && <Badge className="bg-volt-500/15">{r.import_source}</Badge>}
                      </div>
                    </td>
                    <td className="max-w-xs truncate p-3 text-white/75">{r.answer}</td>
                    <td className="p-3 text-center text-xs">
                      {c?.icon} {c?.name}
                      {r.subcategory_id && <div className="text-white/45">{subName(r.subcategory_id)}</div>}
                    </td>
                    <td className="p-3 text-center font-bold text-gold-300">{tierPoints(r.difficulty)}</td>
                    <td className="p-3 text-center text-xs">
                      <div className="flex flex-wrap justify-center gap-1">
                        {r.verified ? <Badge className="bg-leaf-500/20">موثّق</Badge> : <Badge className="bg-ember-500/20">غير موثّق</Badge>}
                        {!r.is_active && <Badge>معطّل</Badge>}
                        {r.is_blacklisted && <Badge className="bg-wine-500/30">محظور</Badge>}
                        {!r.family_safe && <Badge>غير عائلي</Badge>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-white/50">
                    لا توجد أسئلة بهذه الفلاتر.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button size="sm" variant="soft" disabled={page === 0} onClick={() => setFilter({ page: String(page - 1) })} icon={<ChevronRight className="h-4 w-4" />}>
            السابق
          </Button>
          <span className="text-sm text-white/60">
            {page + 1} / {pages}
          </span>
          <Button size="sm" variant="soft" disabled={page + 1 >= pages} onClick={() => setFilter({ page: String(page + 1) })}>
            التالي <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}
      <Toast message={msg} onClose={() => setMsg(null)} tone="info" />
    </div>
  );
}

function TriSelect({ label, value, yes, no, onChange }: { label: string; value: string; yes: string; no: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{label}: الكل</option>
      <option value="true">{yes}</option>
      <option value="false">{no}</option>
    </select>
  );
}
