"use client";
import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { Category, Subcategory } from "@/lib/db/types";

/** الفئات والفئات الفرعية (للوحة الإدارة — تشمل غير المفعّل) */
export function useTaxonomy() {
  const [cats, setCats] = useState<Category[]>([]);
  const [subs, setSubs] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = async () => {
    const sb = getBrowserSupabase();
    const [c, s] = await Promise.all([
      sb.from("categories").select("*").order("sort_order"),
      sb.from("subcategories").select("*").order("sort_order"),
    ]);
    setCats((c.data ?? []) as Category[]);
    setSubs((s.data ?? []) as Subcategory[]);
    setLoading(false);
  };
  useEffect(() => {
    void reload();
  }, []);
  return { cats, subs, loading, reload };
}

/** رفع ملف إلى Supabase Storage (bucket: media) وإرجاع الرابط العام */
export async function uploadMedia(file: File, folder = "questions"): Promise<string> {
  const sb = getBrowserSupabase();
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from("media").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return sb.storage.from("media").getPublicUrl(path).data.publicUrl;
}
