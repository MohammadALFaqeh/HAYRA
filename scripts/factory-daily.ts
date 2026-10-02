// تشغيل مصنع الأسئلة اليومي (GitHub Actions أو يدويًا):
//   npm run factory:daily                      ← الدورة الكاملة (Wikidata → فحوص → Claude → نشر)
//   npm run factory:daily -- --dry-run         ← بدون قاعدة بيانات ولا Claude: يعرض عينات فقط
//   npm run factory:daily -- --recipes=capital,flag --per-recipe=10 --no-publish
//
// المتغيرات: NEXT_PUBLIC_SUPABASE_URL، SUPABASE_SERVICE_ROLE_KEY، ANTHROPIC_API_KEY
//   FACTORY_AUTO_PUBLISH=false ← مفتاح إيقاف النشر التلقائي (يبقى كل شيء للمراجعة)
//   FACTORY_PER_RECIPE         ← عدد المواضيع الجديدة لكل وصفة في كل تشغيل (افتراضي 25)
import { existsSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { runCandidateChecks } from "../src/lib/factory/checks";
import { generateWikidataCandidate } from "../src/lib/factory/generators/wikidata-templates";
import { RECIPES, RECIPE_IDS, getRecipe, takeNewSubjects } from "../src/lib/factory/providers/wikidata-recipes";
import { runFactoryCycle } from "../src/lib/factory/pipeline";
import type { SourceFact } from "../src/lib/factory/types";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"] as const;
  }),
);
const recipeIds = (args.get("recipes") ?? RECIPE_IDS.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
const perRecipe = Number(args.get("per-recipe") ?? process.env.FACTORY_PER_RECIPE ?? 25);
const log = (m: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);

const unknown = recipeIds.filter((r) => !getRecipe(r));
if (unknown.length) {
  console.error(`وصفات غير معروفة: ${unknown.join(", ")} — المتاح: ${RECIPE_IDS.join(", ")}`);
  process.exit(2);
}
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

  const useAi = !args.has("no-ai") && !!process.env.ANTHROPIC_API_KEY;
  if (!useAi) log("⚠️ بدون Claude (ANTHROPIC_API_KEY غير موجود أو --no-ai): لن يُنشر أي سؤال، كل شيء يبقى للمراجعة");
  const autoPublish = !args.has("no-publish") && process.env.FACTORY_AUTO_PUBLISH !== "false";
  if (!autoPublish) log("النشر التلقائي متوقف: الموافَق عليه يبقى approved");

  log(`بدء الدورة: ${recipeIds.length} وصفة × ${perRecipe} موضوع جديد`);
  const summaries = await runFactoryCycle(sb, {
    recipeIds,
    perRecipe,
    ai: useAi ? new Anthropic() : null,
    autoPublish,
    log,
  });
  const total = summaries.reduce((n, s) => n + s.published, 0);
  const errors = summaries.filter((s) => s.error);
  log(`انتهت الدورة: نُشر ${total} سؤال جديد${errors.length ? ` — ${errors.length} وصفة فشلت` : ""}`);
  if (errors.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
