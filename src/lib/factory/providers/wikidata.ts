// مزوّد حقائق Wikidata للمصنع — يجلب الحقائق فقط، ولا يولّد أسئلة.
// يعيد استخدام استعلام SPARQL وتجميع الدول من مستورد Wikidata القديم.
import { fetchWikidataCountries, type WikidataCountry, type WikidataEntityRef } from "@/lib/importers/wikidata";
import type { SourceFactInput } from "../types";

export type WikidataFactType = "capital" | "currency";

export const WIKIDATA_FACT_TYPES: Record<
  WikidataFactType,
  { property: string; categorySlug: string; subcategorySlug: string; values: (c: WikidataCountry) => WikidataEntityRef[] }
> = {
  capital: { property: "P36", categorySlug: "geography", subcategorySlug: "capitals", values: (c) => c.capitals },
  currency: { property: "P38", categorySlug: "geography", subcategorySlug: "countries", values: (c) => c.currencies },
};

export const isWikidataFactType = (v: unknown): v is WikidataFactType => typeof v === "string" && v in WIKIDATA_FACT_TYPES;

/** نسخة من شكل الاستعلام — تُحفظ مع كل حقيقة لتتبع مصدرها إذا تغيّر الاستعلام لاحقًا */
export const WIKIDATA_QUERY_VERSION = "countries-v1";

/**
 * يحوّل الدول إلى حقائق (دالة نقية — مختبرة بدون شبكة).
 * limit = عدد الدول (الأشهر أولًا). الدولة ذات القيم المتعددة (أكثر من عاصمة/عملة)
 * تُنتج حقيقة لكل قيمة، مع value_count في raw_payload ليقرر المولّد ماذا يفعل بها.
 */
export function countriesToFacts(
  countries: WikidataCountry[],
  factType: WikidataFactType,
  limit: number,
  retrievedAt: string,
): SourceFactInput[] {
  const cfg = WIKIDATA_FACT_TYPES[factType];
  // ترتيب ثابت: الشهرة تنازليًا ثم رقم الكيان (لثبات النتائج عند التعادل)
  const ranked = [...countries].sort((a, b) => b.links - a.links || a.id.localeCompare(b.id));
  const facts: SourceFactInput[] = [];
  let subjects = 0;
  ranked.forEach((c, rankIndex) => {
    const values = cfg.values(c);
    if (!values.length || subjects >= limit) return;
    subjects++;
    for (const v of values) {
      facts.push({
        provider: "wikidata",
        external_id: c.id,
        subject: c.name,
        predicate: factType,
        object_value: v.label,
        category_slug: cfg.categorySlug,
        subcategory_slug: cfg.subcategorySlug,
        source_url: `https://www.wikidata.org/wiki/${c.id}`,
        source_name: "Wikidata",
        source_license: "CC0",
        raw_payload: {
          subject_id: c.id,
          property: cfg.property,
          object_id: v.id,
          value_count: values.length,
          popularity_rank: rankIndex,
          popularity_total: ranked.length,
          sitelinks: c.links,
          query_version: WIKIDATA_QUERY_VERSION,
        },
        retrieved_at: retrievedAt,
      });
    }
  });
  return facts;
}

export async function fetchWikidataFacts(opts: { factType: WikidataFactType; limit: number }): Promise<SourceFactInput[]> {
  const countries = await fetchWikidataCountries();
  return countriesToFacts(countries, opts.factType, opts.limit, new Date().toISOString());
}
