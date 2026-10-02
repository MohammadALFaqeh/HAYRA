import type { NextRequest } from "next/server";
import { errorJson, json } from "@/lib/http";
import { getAdminUser, getServerSupabase } from "@/lib/supabase/server";
import { RECIPE_IDS, isRecipeId } from "@/lib/factory/providers/wikidata-recipes";
import { FactoryRunError, WIKIDATA_MAX_LIMIT, runWikidataFactory } from "@/lib/factory/run-wikidata";

export const runtime = "nodejs";
export const maxDuration = 60;

/** تشغيل وصفة واحدة يدويًا: حقائق → مرشّحون → فحوص → تكرار. لا مراجعة AI ولا نشر (هذا في التشغيل اليومي). */
export async function POST(req: NextRequest) {
  const user = await getAdminUser();
  if (!user) return errorJson("هذه العملية للمشرفين فقط", 403);

  const body = (await req.json().catch(() => ({}))) as { factType?: unknown; limit?: unknown };
  // factType: اسم وصفة (capital، currency، flag، animal_image…)
  if (!isRecipeId(body.factType)) return errorJson(`factType يجب أن يكون أحد: ${RECIPE_IDS.join("، ")}`);
  const limit = body.limit === undefined ? 100 : Number(body.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > WIKIDATA_MAX_LIMIT) return errorJson(`limit يجب أن يكون عددًا صحيحًا بين 1 و${WIKIDATA_MAX_LIMIT}`);

  const sb = await getServerSupabase();
  try {
    const { batch, counts } = await runWikidataFactory(sb, { recipeId: body.factType, limit });
    return json({ batch, counts });
  } catch (e) {
    // التفاصيل في سجلات السيرفر وفي generation_batches.metadata.error — لا تُرسل للمتصفح
    console.error("[factory/wikidata]", e);
    if (e instanceof FactoryRunError) {
      const msg = e.stage === "fetch_facts" ? "تعذّر جلب البيانات من Wikidata، حاول لاحقًا" : "فشل تشغيل المصنع — راجع الدفعة";
      return errorJson(msg, e.stage === "fetch_facts" ? 502 : 500, { batchId: e.batchId, stage: e.stage });
    }
    return errorJson("فشل تشغيل المصنع", 500);
  }
}
