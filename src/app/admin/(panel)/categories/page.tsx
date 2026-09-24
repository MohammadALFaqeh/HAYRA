"use client";
import { useState } from "react";
import { ChevronDown, Plus, Save, Trash2 } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { useTaxonomy } from "@/lib/client/admin-data";
import type { Category, CategoryColor, Subcategory } from "@/lib/db/types";
import { Button, Field, Modal, Spinner, Toast, Toggle } from "@/components/ui";
import { cn, COLOR_CLASSES, colorOf } from "@/lib/utils";

const COLORS = Object.keys(COLOR_CLASSES) as CategoryColor[];
const slugOk = (s: string) => /^[a-z0-9-]+$/.test(s);

export default function CategoriesPage() {
  const { cats, subs, loading, reload } = useTaxonomy();
  const [open, setOpen] = useState<string | null>(null);
  const [editCat, setEditCat] = useState<Partial<Category> | null>(null);
  const [editSub, setEditSub] = useState<Partial<Subcategory> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function saveCat() {
    if (!editCat) return;
    if (!editCat.name?.trim() || !editCat.slug || !slugOk(editCat.slug)) return setMsg("الاسم مطلوب، والـ slug بأحرف إنجليزية صغيرة وأرقام و - فقط");
    const sb = getBrowserSupabase();
    const payload = {
      slug: editCat.slug,
      name: editCat.name.trim(),
      description: editCat.description || null,
      icon: editCat.icon || "❓",
      color: editCat.color || "volt",
      is_interactive: !!editCat.is_interactive,
      sort_order: Number(editCat.sort_order ?? 0),
      is_active: editCat.is_active ?? true,
    };
    const { error } = editCat.id ? await sb.from("categories").update(payload).eq("id", editCat.id) : await sb.from("categories").insert(payload);
    if (error) return setMsg(error.message);
    setEditCat(null);
    await reload();
  }

  async function saveSub() {
    if (!editSub) return;
    if (!editSub.name?.trim() || !editSub.slug || !slugOk(editSub.slug)) return setMsg("الاسم مطلوب، والـ slug بأحرف إنجليزية صغيرة وأرقام و - فقط");
    const sb = getBrowserSupabase();
    const payload = {
      category_id: editSub.category_id!,
      slug: editSub.slug,
      name: editSub.name.trim(),
      description: editSub.description || null,
      icon: editSub.icon || null,
      sort_order: Number(editSub.sort_order ?? 0),
      is_active: editSub.is_active ?? true,
    };
    const { error } = editSub.id ? await sb.from("subcategories").update(payload).eq("id", editSub.id) : await sb.from("subcategories").insert(payload);
    if (error) return setMsg(error.message);
    setEditSub(null);
    await reload();
  }

  async function removeCat(c: Category) {
    if (!confirm(`حذف فئة «${c.name}»؟ لا يمكن حذف فئة فيها أسئلة — عطّلها بدلًا من ذلك.`)) return;
    const { error } = await getBrowserSupabase().from("categories").delete().eq("id", c.id);
    if (error) return setMsg(error.code === "23503" ? "الفئة تحتوي أسئلة — انقلها أو عطّل الفئة" : error.message);
    await reload();
  }
  async function removeSub(s: Subcategory) {
    if (!confirm(`حذف «${s.name}»؟ أسئلتها ستبقى في الفئة الرئيسية بدون فئة فرعية.`)) return;
    const { error } = await getBrowserSupabase().from("subcategories").delete().eq("id", s.id);
    if (error) return setMsg(error.message);
    await reload();
  }

  if (loading) return <Spinner />;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-extrabold">الفئات</h1>
        <Button icon={<Plus className="h-5 w-5" />} onClick={() => setEditCat({ color: "volt", icon: "❓", is_active: true, sort_order: cats.length + 1 })}>
          فئة جديدة
        </Button>
      </div>
      <div className="space-y-2">
        {cats.map((c) => {
          const list = subs.filter((s) => s.category_id === c.id);
          return (
            <div key={c.id} className={cn("panel overflow-hidden", !c.is_active && "opacity-60")}>
              <div className="flex items-center gap-3 border-r-4 p-4" style={{ borderColor: colorOf(c.color).hex }}>
                <span className="text-3xl">{c.icon}</span>
                <button className="min-w-0 flex-1 text-right" onClick={() => setOpen(open === c.id ? null : c.id)}>
                  <div className="font-display text-lg font-bold">
                    {c.name} {!c.is_active && <span className="text-xs text-white/50">(معطّلة)</span>}
                  </div>
                  <div className="text-xs text-white/45" dir="ltr">
                    {c.slug} — {list.length} فرعية
                  </div>
                </button>
                <Button size="sm" variant="soft" onClick={() => setEditCat(c)}>
                  تعديل
                </Button>
                <button onClick={() => removeCat(c)} className="rounded-lg p-2 text-white/40 hover:text-wine-400" aria-label="حذف">
                  <Trash2 className="h-4 w-4" />
                </button>
                <ChevronDown className={cn("h-5 w-5 transition", open === c.id && "rotate-180")} />
              </div>
              {open === c.id && (
                <div className="space-y-1 border-t border-white/[0.06] bg-night-950/40 p-3">
                  {list.map((s) => (
                    <div key={s.id} className={cn("flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-white/[0.04]", !s.is_active && "opacity-50")}>
                      <span>{s.icon}</span>
                      <span className="flex-1">{s.name}</span>
                      <span className="text-xs text-white/40" dir="ltr">
                        {s.slug}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => setEditSub(s)}>
                        تعديل
                      </Button>
                      <button onClick={() => removeSub(s)} className="rounded-lg p-1.5 text-white/40 hover:text-wine-400" aria-label="حذف">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => setEditSub({ category_id: c.id, is_active: true, sort_order: list.length + 1 })}>
                    فئة فرعية
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Modal open={!!editCat} onClose={() => setEditCat(null)} title={editCat?.id ? "تعديل الفئة" : "فئة جديدة"}>
        {editCat && (
          <div className="space-y-3">
            <div className="grid grid-cols-[80px_1fr] gap-3">
              <Field label="أيقونة">
                <input value={editCat.icon ?? ""} onChange={(e) => setEditCat({ ...editCat, icon: e.target.value })} className="w-full text-center text-2xl" />
              </Field>
              <Field label="الاسم">
                <input value={editCat.name ?? ""} onChange={(e) => setEditCat({ ...editCat, name: e.target.value })} className="w-full" />
              </Field>
            </div>
            <Field label="Slug (معرّف إنجليزي)" hint="مثال: world-history — يستخدم في الاستيراد">
              <input value={editCat.slug ?? ""} onChange={(e) => setEditCat({ ...editCat, slug: e.target.value.toLowerCase() })} className="w-full" dir="ltr" />
            </Field>
            <Field label="الوصف">
              <input value={editCat.description ?? ""} onChange={(e) => setEditCat({ ...editCat, description: e.target.value })} className="w-full" />
            </Field>
            <div className="space-y-1.5">
              <span className="text-sm font-semibold text-white/80">اللون</span>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setEditCat({ ...editCat, color: c })}
                    className={cn("h-9 w-9 rounded-full", editCat.color === c && "ring-2 ring-white ring-offset-2 ring-offset-night-850")}
                    style={{ background: COLOR_CLASSES[c].hex }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
            <Field label="الترتيب">
              <input type="number" value={editCat.sort_order ?? 0} onChange={(e) => setEditCat({ ...editCat, sort_order: Number(e.target.value) })} className="w-full" />
            </Field>
            <Toggle checked={!!editCat.is_interactive} onChange={(v) => setEditCat({ ...editCat, is_interactive: v })} label="فئة تفاعلية" />
            <Toggle checked={editCat.is_active ?? true} onChange={(v) => setEditCat({ ...editCat, is_active: v })} label="مفعّلة" />
            <Button className="w-full" icon={<Save className="h-5 w-5" />} onClick={saveCat}>
              حفظ
            </Button>
          </div>
        )}
      </Modal>

      <Modal open={!!editSub} onClose={() => setEditSub(null)} title={editSub?.id ? "تعديل الفئة الفرعية" : "فئة فرعية جديدة"}>
        {editSub && (
          <div className="space-y-3">
            <div className="grid grid-cols-[80px_1fr] gap-3">
              <Field label="أيقونة">
                <input value={editSub.icon ?? ""} onChange={(e) => setEditSub({ ...editSub, icon: e.target.value })} className="w-full text-center text-2xl" />
              </Field>
              <Field label="الاسم">
                <input value={editSub.name ?? ""} onChange={(e) => setEditSub({ ...editSub, name: e.target.value })} className="w-full" />
              </Field>
            </div>
            <Field label="الفئة الرئيسية">
              <select value={editSub.category_id} onChange={(e) => setEditSub({ ...editSub, category_id: e.target.value })} className="w-full">
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Slug">
              <input value={editSub.slug ?? ""} onChange={(e) => setEditSub({ ...editSub, slug: e.target.value.toLowerCase() })} className="w-full" dir="ltr" />
            </Field>
            <Field label="الترتيب">
              <input type="number" value={editSub.sort_order ?? 0} onChange={(e) => setEditSub({ ...editSub, sort_order: Number(e.target.value) })} className="w-full" />
            </Field>
            <Toggle checked={editSub.is_active ?? true} onChange={(v) => setEditSub({ ...editSub, is_active: v })} label="مفعّلة" />
            <Button className="w-full" icon={<Save className="h-5 w-5" />} onClick={saveSub}>
              حفظ
            </Button>
          </div>
        )}
      </Modal>
      <Toast message={msg} onClose={() => setMsg(null)} />
    </div>
  );
}
