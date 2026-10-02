// تشغيل مصنع الأسئلة اليومي (GitHub Actions أو يدويًا):
//   npm run factory:daily                      ← الدورة الكاملة (Wikidata → فحوص → مراجعة → نشر)
//   npm run factory:daily -- --dry-run         ← بدون قاعدة بيانات ولا Claude: يعرض عينات فقط
//   npm run factory:daily -- --recipes=capital,flag --per-recipe=10 --no-publish
//   npm run factory:daily -- --review-mode=claude --review-pending [--batch=<uuid>] [--limit=25]
//        ← إعادة مراجعة المحجوزين بسبب فشل Claude فقط (وضع claude فقط؛ لا حقائق ولا مرشحين جدد)
//
// رمز الخروج: 0 = نجاح كامل. 1 = فشل وصفة، أو خطأ Claude قاتل، أو أي عنصر بقي بلا مراجعة.
//
// المتغيرات: NEXT_PUBLIC_SUPABASE_URL، SUPABASE_SERVICE_ROLE_KEY
//   FACTORY_REVIEW_MODE        ← deterministic (افتراضي، مجاني، الأنواع المسموحة فقط) أو claude (يحتاج ANTHROPIC_API_KEY)
//   FACTORY_AUTO_PUBLISH=false ← مفتاح إيقاف النشر التلقائي (يبقى كل شيء للمراجعة)
//   FACTORY_PER_RECIPE         ← عدد المواضيع الجديدة لكل وصفة في كل تشغيل (افتراضي 25)
import { existsSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { runCandidateChecks } from "../src/lib/factory/checks";
import { generateWikidataCandidate } from "../src/lib/factory/generators/wikidata-templates";
import { RECIPES, getRecipe, takeNewSubjects } from "../src/lib/factory/providers/wikidata-recipes";
import { reviewPendingCandidates, runFactoryCycle } from "../src/lib/factory/pipeline";
import { resolveRunConfig } from "../src/lib/factory/review-modes";
import type { SourceFact } from "../src/lib/factory/types";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"] as const;
  }),
);
const config = resolveRunConfig({ env: process.env, modeArg: args.get("review-mode"), recipesArg: args.get("recipes") });
if (!config.ok) {
  console.error(config.error);
  process.exit(2);
}
const { mode, recipeIds } = config;
const perRecipe = Number(args.get("per-recipe") ?? process.env.FACTORY_PER_RECIPE ?? 25);
const log = (m: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);

if (!Number.isInteger(perRecipe) || perRecipe < 1 || perRecipe > 500) {
  console.error("per-recipe بين 1 و500");
  process.exit(2);
}

async function dryRun() {
  // تصنيف تقريبي من الوصفات نفسها (بدون قاعدة بيانات) — فحص التصنيف الحقيقي يتم في التشغيل الكامل
  const cats = [...new Set(RECIPES.map((r) => r.categorySlug))].map((slug) => ({ id: slug, slug, name: slug }));
  const subs = RECIPES.map((r) => ({ category_id: r.categorySlug, slug: r.subcategorySlug, name: r.subcategorySlug }));
  for (const id of recipeIds) {
    const recipe = getRecipe(id)!;
    const t = Date.now();
    try {
      const facts = takeNewSubjects(await recipe.fetchAll(new Date().toISOString()), new Set(), perRecipe);
      let ok = 0;
      let skipped = 0;
      const failed: string[] = [];
      const samples: string[] = [];
      for (const f of facts) {
        const res = generateWikidataCandidate({ ...f, raw_payload: f.raw_payload } as SourceFact);
        if ("skip" in res) {
          skipped++;
          continue;
        }
        const checks = runCandidateChecks(res.payload, { fact: f, categories: cats, subcategories: subs });
        const fails = checks.filter((c) => c.status === "fail").map((c) => c.check_name);
        if (fails.length) failed.push(`${res.payload.question_text} → ${res.payload.answer} [${fails.join(",")}]`);
        else ok++;
        if (samples.length < 6) {
          const p = res.payload;
          samples.push(`${p.question_text} → ${p.answer}${p.choices ? ` (${p.choices.join(" / ")})` : ""} · صعوبة ${p.difficulty}${p.image_url ? " · 🖼" : ""}`);
        }
      }
      log(`[${id}] ${facts.length} حقيقة، ${ok} سليم، ${failed.length} فاشل بالفحوص، ${skipped} متخطّى (${Math.round((Date.now() - t) / 1000)}s)`);
      for (const s of samples) console.log(`    • ${s}`);
      for (const s of failed.slice(0, 4)) console.log(`    ✗ ${s}`);
    } catch (e) {
      log(`[${id}] ERROR ${(e as Error).message}`);
    }
  }
}

async function main() {
  if (args.has("dry-run")) return dryRun();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY مطلوبان");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  if (args.has("review-pending")) {
    // المحجوزون بسبب فشل Claude لا يُنشرون آليًا بالوضع الثابت — إعادة مراجعتهم بـClaude فقط
    if (mode !== "claude") throw new Error("--review-pending متاح في وضع claude فقط (--review-mode=claude)");
    const limit = Number(args.get("limit") ?? 25);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("limit بين 1 و500");
    const batchId = args.get("batch");
    const autoPublishPending = !args.has("no-publish") && process.env.FACTORY_AUTO_PUBLISH !== "false";
    log(`إعادة مراجعة المحجوزين: حتى ${limit}${batchId ? ` من الدفعة ${batchId}` : ""}${autoPublishPending ? "" : " (بدون نشر)"}`);
    const r = await reviewPendingCandidates(sb, { ai: new Anthropic(), autoPublish: autoPublishPending, limit, batchId, log });
    log(
      `انتهت: ${r.considered} محجوز، مكرر بعد إعادة الفحص ${r.dupRejected}، راجعه Claude ${r.aiReviewed} (فشل ${r.aiFailed})، ` +
        `رفضه ${r.aiRejected}، محجوز ${r.held}، نُشر ${r.published}${r.publishedIds.length ? ` → ${r.publishedIds.join(", ")}` : ""}`,
    );
    if (r.aiFatal) log(`⛔ خطأ Claude قاتل: ${r.aiFatal}`);
    if (r.aiFatal || r.aiFailed > 0) process.exitCode = 1;
    return;
  }

  // deterministic: لا يُنشأ عميل Anthropic إطلاقًا (لا يحتاج مفتاحًا)
  const useAi = mode === "claude" && !args.has("no-ai");
  if (mode === "claude" && !useAi) log("⚠️ وضع claude مع --no-ai: لن يُنشر أي سؤال، كل شيء يبقى للمراجعة");
  const autoPublish = !args.has("no-publish") && process.env.FACTORY_AUTO_PUBLISH !== "false";
  if (!autoPublish) log("النشر التلقائي متوقف: الموافَق عليه يبقى approved");

  log(`بدء الدورة (${mode}): ${recipeIds.join("، ")} × ${perRecipe} موضوع جديد`);
  const summaries = await runFactoryCycle(sb, {
    mode,
    recipeIds,
    perRecipe,
    ai: useAi ? new Anthropic() : null,
    autoPublish,
    log,
  });
  const total = summaries.reduce((n, s) => n + s.published, 0);
  const errors = summaries.filter((s) => s.error);
  const aiFailed = summaries.reduce((n, s) => n + s.aiFailed, 0);
  const fatal = summaries.find((s) => s.aiFatal)?.aiFatal ?? null;
  const ids = summaries.flatMap((s) => s.publishedIds);
  log(`انتهت الدورة: نُشر ${total} سؤال جديد${errors.length ? ` — ${errors.length} وصفة فشلت` : ""}${aiFailed ? ` — ${aiFailed} بلا مراجعة Claude` : ""}`);
  if (ids.length) log(`الأسئلة المنشورة: ${ids.join(", ")}`);
  // الفشل يجب أن يظهر في GitHub Actions (لا «نجاح» صامت بدون نشر)
  if (errors.length || fatal || (useAi && aiFailed > 0)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
