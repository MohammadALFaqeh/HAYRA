// حفظ الحقائق الخام (source_facts)
// الحقيقة الموجودة مسبقًا لا تُستبدل أبدًا: batch_id/retrieved_at/raw_payload الأصلية تبقى كما هي
// (ON CONFLICT DO NOTHING)، ونرجع الصف الموجود ليُربط به المرشّح الجديد.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SourceFact, SourceFactInput } from "./types";

type FactIdentity = Pick<SourceFact, "provider" | "external_id" | "predicate" | "object_value">;
export const factKey = (f: FactIdentity) => [f.provider, f.external_id, f.predicate, f.object_value].join("\u0000");

export interface SaveFactsResult {
  /** صف واحد لكل حقيقة مدخلة (بعد إزالة المكرر)، بنفس الترتيب */
  facts: SourceFact[];
  inserted: number;
  existing: number;
}

export async function saveSourceFacts(sb: SupabaseClient, inputs: SourceFactInput[], batchId: string | null): Promise<SaveFactsResult> {
  const unique = [...new Map(inputs.map((f) => [factKey(f), f])).values()];
  const byKey = new Map<string, SourceFact>();
  let inserted = 0;

  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200).map((f) => ({ ...f, batch_id: batchId }));
    const { data, error } = await sb
      .from("source_facts")
      .upsert(chunk, { onConflict: "provider,external_id,predicate,object_value", ignoreDuplicates: true })
      .select("*");
    if (error) throw new Error(`source_facts/upsert: ${error.message}`);
    for (const row of (data ?? []) as SourceFact[]) byKey.set(factKey(row), row);
    inserted += data?.length ?? 0;
  }

  // الحقائق الموجودة مسبقًا
  const missing = unique.filter((f) => !byKey.has(factKey(f)));
  const groups = new Map<string, string[]>();
  for (const f of missing) groups.set(f.provider, [...(groups.get(f.provider) ?? []), f.external_id]);
  for (const [provider, ids] of groups) {
    const distinct = [...new Set(ids)];
    for (let i = 0; i < distinct.length; i += 150) {
      const { data, error } = await sb
        .from("source_facts")
        .select("*")
        .eq("provider", provider)
        .in("external_id", distinct.slice(i, i + 150));
      if (error) throw new Error(`source_facts/select: ${error.message}`);
      for (const row of (data ?? []) as SourceFact[]) if (!byKey.has(factKey(row))) byKey.set(factKey(row), row);
    }
  }

  const facts = unique.map((f) => byKey.get(factKey(f)));
  const lost = facts.filter((f) => !f).length;
  if (lost) throw new Error(`source_facts: تعذّر العثور على ${lost} حقيقة بعد الحفظ`);
  return { facts: facts as SourceFact[], inserted, existing: unique.length - inserted };
}

/** المواضيع (external_id) التي سبق جلب حقائق لها لهذا النوع — ليأخذ كل تشغيل مواضيع جديدة */
export async function existingSubjects(sb: SupabaseClient, provider: string, predicate: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (let page = 0; page < 100; page++) {
    const { data, error } = await sb
      .from("source_facts")
      .select("external_id")
      .eq("provider", provider)
      .eq("predicate", predicate)
      .order("id", { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(`source_facts/existing: ${error.message}`);
    for (const r of (data ?? []) as { external_id: string }[]) out.add(r.external_id);
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

