// دفعات التوليد (generation_batches)
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerationBatch, GenerationBatchStatus } from "./types";

export interface CreateBatchInput {
  source: string;
  categorySlug?: string | null;
  subcategorySlug?: string | null;
  requestedCount?: number | null;
  metadata?: Record<string, unknown>;
}

export async function createGenerationBatch(sb: SupabaseClient, input: CreateBatchInput): Promise<GenerationBatch> {
  const { data, error } = await sb
    .from("generation_batches")
    .insert({
      source: input.source,
      category_slug: input.categorySlug ?? null,
      subcategory_slug: input.subcategorySlug ?? null,
      status: "pending",
      requested_count: input.requestedCount ?? null,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`generation_batches/insert: ${error?.message ?? "no row"}`);
  return data as GenerationBatch;
}

/** الانتقالات المسموحة — لا رجوع من completed/failed */
const ALLOWED_FROM: Record<GenerationBatchStatus, GenerationBatchStatus[]> = {
  pending: [],
  running: ["pending"],
  completed: ["running"],
  failed: ["pending", "running"],
};

export interface BatchCounts {
  generated_count?: number;
  accepted_count?: number;
  rejected_count?: number;
}

/**
 * يغيّر حالة الدفعة بشرط أن تكون في حالة سابقة مسموحة (تحديث مشروط ذري)،
 * ويدمج metadata الجديدة مع الموجودة بدل استبدالها.
 */
export async function setBatchStatus(
  sb: SupabaseClient,
  id: string,
  status: GenerationBatchStatus,
  extra: { counts?: BatchCounts; metadata?: Record<string, unknown> } = {},
): Promise<GenerationBatch> {
  const patch: Record<string, unknown> = { status, ...(extra.counts ?? {}) };
  if (extra.metadata) {
    const { data: cur, error } = await sb.from("generation_batches").select("metadata").eq("id", id).single();
    if (error) throw new Error(`generation_batches/read: ${error.message}`);
    patch.metadata = { ...((cur?.metadata as Record<string, unknown>) ?? {}), ...extra.metadata };
  }
  const { data, error } = await sb
    .from("generation_batches")
    .update(patch)
    .eq("id", id)
    .in("status", ALLOWED_FROM[status])
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`generation_batches/update: ${error.message}`);
  if (!data) throw new Error(`generation_batches: انتقال غير مسموح إلى ${status}`);
  return data as GenerationBatch;
}

/** تحديث العدادات أثناء التشغيل فقط */
export async function updateBatchCounts(sb: SupabaseClient, id: string, counts: BatchCounts): Promise<void> {
  const { error } = await sb.from("generation_batches").update(counts).eq("id", id).eq("status", "running");
  if (error) throw new Error(`generation_batches/counts: ${error.message}`);
}

/** يدمج metadata بدون تغيير الحالة (لإضافة نتائج المراجعة والنشر بعد اكتمال الدفعة) */
export async function mergeBatchMetadata(sb: SupabaseClient, id: string, metadata: Record<string, unknown>): Promise<void> {
  const { data: cur, error } = await sb.from("generation_batches").select("metadata").eq("id", id).single();
  if (error) throw new Error(`generation_batches/read: ${error.message}`);
  const { error: upErr } = await sb
    .from("generation_batches")
    .update({ metadata: { ...((cur?.metadata as Record<string, unknown>) ?? {}), ...metadata } })
    .eq("id", id);
  if (upErr) throw new Error(`generation_batches/metadata: ${upErr.message}`);
}
