import type { NextRequest } from "next/server";
import { errorJson, json } from "@/lib/http";
import { isUuid } from "@/lib/server-auth";
import { getAdminUser, getServerSupabase } from "@/lib/supabase/server";
import { CANDIDATE_STATUSES, listCandidates, transitionCandidates, type ReviewAction } from "@/lib/factory/candidates";
import type { CandidateStatus } from "@/lib/factory/types";

export const runtime = "nodejs";

const SLUG = /^[a-z0-9-]+$/;
const MAX_PAGE_SIZE = 100;
const MAX_IDS = 100;

/** قائمة المرشّحين مع الحقيقة والفحوص ومعلومات التكرار */
export async function GET(req: NextRequest) {
  const user = await getAdminUser();
  if (!user) return errorJson("هذه العملية للمشرفين فقط", 403);

  const p = req.nextUrl.searchParams;
  const status = p.get("status") || undefined;
  const batchId = p.get("batch") || undefined;
  const category = p.get("category") || undefined;
  const subcategory = p.get("subcategory") || undefined;
  const page = Number(p.get("page") ?? 0);
  const pageSize = Number(p.get("pageSize") ?? 50);

  if (status && !CANDIDATE_STATUSES.includes(status as CandidateStatus)) return errorJson("status غير صالح");
  if (batchId && !isUuid(batchId)) return errorJson("batch غير صالح");
  if (category && !SLUG.test(category)) return errorJson("category غير صالح");
  if (subcategory && !SLUG.test(subcategory)) return errorJson("subcategory غير صالح");
  if (!Number.isInteger(page) || page < 0) return errorJson("page غير صالح");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) return errorJson(`pageSize بين 1 و${MAX_PAGE_SIZE}`);

  try {
    const sb = await getServerSupabase();
    const { items, total } = await listCandidates(sb, { status: status as CandidateStatus | undefined, batchId, category, subcategory, page, pageSize });
    return json({ items, total, page, pageSize });
  } catch (e) {
    console.error("[admin/candidates GET]", e);
    return errorJson("تعذّر جلب المرشّحين", 500);
  }
}

/**
 * إجراءات المراجعة: approve (needs_review → approved) أو reject (مع سبب).
 * الموافقة لا تنشر في public.questions.
 */
export async function PATCH(req: NextRequest) {
  const user = await getAdminUser();
  if (!user) return errorJson("هذه العملية للمشرفين فقط", 403);

  const body = (await req.json().catch(() => ({}))) as { id?: unknown; ids?: unknown; action?: unknown; reason?: unknown };
  const action = body.action;
  if (action !== "approve" && action !== "reject") return errorJson("action يجب أن يكون approve أو reject");

  const ids = Array.isArray(body.ids) ? body.ids : body.id !== undefined ? [body.id] : [];
  if (!ids.length || ids.length > MAX_IDS || !ids.every(isUuid)) return errorJson(`أرسل id أو ids (حتى ${MAX_IDS}) بصيغة uuid`);

  let reason: string | null = null;
  if (action === "reject") {
    reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) return errorJson("سبب الرفض مطلوب");
    if (reason.length > 1000) return errorJson("سبب الرفض طويل جدًا (الحد 1000)");
  }

  try {
    const sb = await getServerSupabase();
    const res = await transitionCandidates(sb, [...new Set(ids as string[])], action as ReviewAction, reason);
    return json(res, res.updated.length ? 200 : 409);
  } catch (e) {
    console.error("[admin/candidates PATCH]", e);
    return errorJson("تعذّر تحديث المرشّحين", 500);
  }
}
