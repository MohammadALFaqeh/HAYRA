"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2, X } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { useTaxonomy } from "@/lib/client/admin-data";
import type { GamePack, GamePackCategory } from "@/lib/db/types";
import { LEVELS, QUESTION_TYPES, QUESTION_TYPE_IDS } from "@/lib/game/constants";
import type { Level, QuestionType } from "@/lib/game/types";
import { Button, Field, Modal, Spinner, Toast, Toggle } from "@/components/ui";
import { cn } from "@/lib/utils";

type Draft = Partial<GamePack> & { items: { category_id: string; subcategory_id: string | null }[] };

const toLocal = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");

export default function PacksPage() {
  const { cats, subs } = useTaxonomy();
  const [packs, setPacks] = useState<GamePack[]>([]);
  const [links, setLinks] = useState<GamePackCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = getBrowserSupabase();
    const [p, l] = await Promise.all([sb.from("game_packs").select("*").order("sort_order"), sb.from("game_pack_categories").select("*").order("sort_order")]);
    setPacks((p.data ?? []) as GamePack[]);
    setLinks((l.data ?? []) as GamePackCategory[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const open = (p?: GamePack) =>
    setEdit(
      p
        ? { ...p, items: links.filter((l) => l.pack_id === p.id).map((l) => ({ category_id: l.category_id, subcategory_id: l.subcategory_id })) }
        : { emoji: "🎯", level: "medium", category_count: 6, question_types: [], is_active: true, is_seasonal: false, family_mode: false, sort_order: packs.length + 1, items: [] },
    );

  async function save() {
    if (!edit) return;
    if (!edit.name?.trim() || !edit.slug || !/^[a-z0-9-]+$/.test(edit.slug)) return setMsg("الاسم والـ slug مطلوبان (slug: a-z 0-9 -)");
    if (edit.items.length < 3) return setMsg("أضف 3 فئات على الأقل");
    const count = Math.min(Number(edit.category_count ?? 6), edit.items.length);
    const sb = getBrowserSupabase();
    const payload = {
      slug: edit.slug,
      name: edit.name.trim(),
      description: edit.description || null,
      emoji: edit.emoji || "🎯",
      level: edit.level ?? "medium",
      category_count: Math.max(3, Math.min(8, count)),
      question_types: edit.question_types ?? [],
      family_mode: !!edit.family_mode,
      is_seasonal: !!edit.is_seasonal,
      season_label: edit.season_label || null,
      starts_at: edit.starts_at || null,
      ends_at: edit.ends_at || null,
      is_active: edit.is_active ?? true,
      sort_order: Number(edit.sort_order ?? 0),
    };
    const res = edit.id ? await sb.from("game_packs").update(payload).eq("id", edit.id).select("id").single() : await sb.from("game_packs").insert(payload).select("id").single();
    if (res.error) return setMsg(res.error.message);
    const packId = res.data.id as string;
    await sb.from("game_pack_categories").delete().eq("pack_id", packId);
    const { error } = await sb
      .from("game_pack_categories")
      .insert(edit.items.map((it, i) => ({ pack_id: packId, category_id: it.category_id, subcategory_id: it.subcategory_id, sort_order: i + 1 })));
    if (error) return setMsg(error.message);
    setEdit(null);
    await load();
  }

  async function remove(p: GamePack) {
    if (!confirm(`حذف باقة «${p.name}»؟`)) return;
    await getBrowserSupabase().from("game_packs").delete().eq("id", p.id);
    await load();
  }

  const label = (it: { category_id: string; subcategory_id: string | null }) => {
    const c = cats.find((x) => x.id === it.category_id);
    const s = subs.find((x) => x.id === it.subcategory_id);
    return `${s?.icon ?? c?.icon ?? ""} ${c?.name ?? "?"}${s ? ` / ${s.name}` : ""}`;
  };
  const move = (i: number, d: -1 | 1) => {
    if (!edit) return;
    const items = [...edit.items];
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    setEdit({ ...edit, items });
  };
  const [addCat, setAddCat] = useState("");
  const [addSub, setAddSub] = useState("");

  if (loading) return <Spinner />;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-extrabold">الباقات الجاهزة والموسمية</h1>
        <Button icon={<Plus className="h-5 w-5" />} onClick={() => open()}>
          باقة جديدة
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {packs.map((p) => (
          <div key={p.id} className={cn("panel space-y-2 p-4", !p.is_active && "opacity-50")}>
            <div className="flex items-start justify-between">
              <span className="text-4xl">{p.emoji}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="soft" onClick={() => open(p)}>
                  تعديل
                </Button>
                <button onClick={() => remove(p)} className="rounded-lg p-2 text-white/40 hover:text-wine-400" aria-label="حذف">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="font-display text-xl font-bold">{p.name}</div>
            <div className="text-sm text-white/55">{p.description}</div>
            <div className="flex flex-wrap gap-2 text-xs text-white/50">
              <span>{LEVELS.find((l) => l.id === p.level)?.name}</span>
              <span>{p.category_count} أعمدة من {links.filter((l) => l.pack_id === p.id).length} خيار</span>
              {p.is_seasonal && <span>🗓️ {p.season_label ?? "موسمية"}</span>}
              {p.family_mode && <span>👨‍👩‍👧</span>}
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "تعديل الباقة" : "باقة جديدة"} wide>
        {edit && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="grid grid-cols-[80px_1fr] gap-3">
                <Field label="رمز">
                  <input value={edit.emoji ?? ""} onChange={(e) => setEdit({ ...edit, emoji: e.target.value })} className="w-full text-center text-2xl" />
                </Field>
                <Field label="الاسم">
                  <input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="w-full" />
                </Field>
              </div>
              <Field label="Slug">
                <input value={edit.slug ?? ""} onChange={(e) => setEdit({ ...edit, slug: e.target.value.toLowerCase() })} className="w-full" dir="ltr" />
              </Field>
              <Field label="الوصف">
                <input value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} className="w-full" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="المستوى">
                  <select value={edit.level} onChange={(e) => setEdit({ ...edit, level: e.target.value as Level })} className="w-full">
                    {LEVELS.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="عدد الأعمدة" hint="يُختار عشوائيًا من القائمة">
                  <input type="number" min={3} max={8} value={edit.category_count ?? 6} onChange={(e) => setEdit({ ...edit, category_count: Number(e.target.value) })} className="w-full" />
                </Field>
              </div>
              <Field label="الترتيب">
                <input type="number" value={edit.sort_order ?? 0} onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) })} className="w-full" />
              </Field>
              <Toggle checked={!!edit.family_mode} onChange={(v) => setEdit({ ...edit, family_mode: v })} label="الوضع العائلي إجباري" />
              <Toggle checked={edit.is_active ?? true} onChange={(v) => setEdit({ ...edit, is_active: v })} label="مفعّلة" />
              <Toggle checked={!!edit.is_seasonal} onChange={(v) => setEdit({ ...edit, is_seasonal: v })} label="باقة موسمية" />
              {edit.is_seasonal && (
                <div className="space-y-3 rounded-2xl bg-white/[0.04] p-3">
                  <Field label="اسم الموسم">
                    <input value={edit.season_label ?? ""} onChange={(e) => setEdit({ ...edit, season_label: e.target.value })} className="w-full" placeholder="رمضان، العيد…" />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="تبدأ">
                      <input type="datetime-local" value={toLocal(edit.starts_at)} onChange={(e) => setEdit({ ...edit, starts_at: e.target.value ? new Date(e.target.value).toISOString() : null })} className="w-full" />
                    </Field>
                    <Field label="تنتهي">
                      <input type="datetime-local" value={toLocal(edit.ends_at)} onChange={(e) => setEdit({ ...edit, ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })} className="w-full" />
                    </Field>
                  </div>
                  <p className="text-xs text-white/45">اتركها فارغة لتظهر دائمًا.</p>
                </div>
              )}
            </div>
            <div className="space-y-3">
              <div className="text-sm font-semibold text-white/80">فئات الباقة ({edit.items.length})</div>
              <ul className="space-y-1">
                {edit.items.map((it, i) => (
                  <li key={i} className="flex items-center gap-1 rounded-xl bg-white/[0.05] px-3 py-1.5 text-sm">
                    <span className="flex-1">{label(it)}</span>
                    <button onClick={() => move(i, -1)} className="p-1 text-white/50" aria-label="أعلى">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button onClick={() => move(i, 1)} className="p-1 text-white/50" aria-label="أسفل">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button onClick={() => setEdit({ ...edit, items: edit.items.filter((_, j) => j !== i) })} className="p-1 text-white/50 hover:text-wine-400" aria-label="حذف">
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <select value={addCat} onChange={(e) => (setAddCat(e.target.value), setAddSub(""))} className="w-full">
                  <option value="">فئة…</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select value={addSub} onChange={(e) => setAddSub(e.target.value)} className="w-full" disabled={!addCat}>
                  <option value="">كاملة</option>
                  {subs
                    .filter((s) => s.category_id === addCat)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
                <Button
                  variant="soft"
                  disabled={!addCat}
                  onClick={() => setEdit({ ...edit, items: [...edit.items, { category_id: addCat, subcategory_id: addSub || null }] })}
                  icon={<Plus className="h-4 w-4" />}
                  aria-label="إضافة"
                />
              </div>
              <div className="space-y-1.5">
                <div className="text-sm font-semibold text-white/80">أنواع الأسئلة (فارغ = الكل)</div>
                <div className="flex flex-wrap gap-1.5">
                  {QUESTION_TYPE_IDS.map((t) => {
                    const on = (edit.question_types ?? []).includes(t);
                    return (
                      <button
                        key={t}
                        onClick={() =>
                          setEdit({
                            ...edit,
                            question_types: on ? (edit.question_types ?? []).filter((x) => x !== t) : [...(edit.question_types ?? []), t as QuestionType],
                          })
                        }
                        className={cn("rounded-lg px-2 py-1 text-xs", on ? "bg-gold-400 text-night-950" : "bg-white/[0.06]")}
                      >
                        {QUESTION_TYPES[t].name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <Button className="md:col-span-2" size="lg" icon={<Save className="h-5 w-5" />} onClick={save}>
              حفظ الباقة
            </Button>
          </div>
        )}
      </Modal>
      <Toast message={msg} onClose={() => setMsg(null)} />
    </div>
  );
}
