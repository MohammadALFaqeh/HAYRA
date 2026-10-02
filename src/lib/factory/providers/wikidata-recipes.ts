// «وصفات» حقائق Wikidata لكل مجال (دول، علوم، معالم، حيوانات…).
// كل وصفة تجلب الحقائق فقط، مرتبة حسب الشهرة. توليد الأسئلة في generators/wikidata-templates.ts.
// كل الاستعلامات جُرّبت على Wikidata الحي (2026-10-02) — الأزمنة المذكورة تقريبية.
import { createHash } from "node:crypto";
import { fetchJson } from "@/lib/importers/types";
import { fetchWikidataCountries } from "@/lib/importers/wikidata";
import type { SourceFactInput } from "../types";
import { countriesToFacts, WIKIDATA_QUERY_VERSION } from "./wikidata";

const ENDPOINT = "https://query.wikidata.org/sparql";
const HEADERS = { Accept: "application/sparql-results+json", "User-Agent": "HayraTriviaImporter/1.0 (educational project)" };

export interface FactRecipe {
  id: string;
  label: string;
  categorySlug: string;
  subcategorySlug: string;
  /** كل الحقائق، الأشهر أولًا. تُرشَّح لاحقًا حسب ما سبق جلبه */
  fetchAll(retrievedAt: string): Promise<SourceFactInput[]>;
}

type Binding = Record<string, { value: string } | undefined>;

async function sparql(query: string): Promise<Binding[]> {
  const data = await fetchJson<{ results: { bindings: Binding[] } }>(
    `${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`,
    { headers: HEADERS },
    65000,
  );
  return data.results.bindings;
}

const qid = (uri?: string) => uri?.split("/").pop() ?? "";
const isLabel = (v?: string) => !!v && !/^Q\d+$/.test(v) && !/^https?:/.test(v);

/**
 * رابط صورة مصغّرة مباشر من Wikimedia (بدون تحويلات Special:FilePath).
 * Wikimedia يقبل أحجامًا قياسية فقط (330/500/960…) — 640 يرجع 400.
 */
export function commonsThumbUrl(filePathOrName: string, width = 500): string {
  const name = decodeURIComponent(filePathOrName.split("/Special:FilePath/").pop()!.split("?")[0]).replace(/ /g, "_");
  const h = createHash("md5").update(name).digest("hex");
  const enc = encodeURIComponent(name);
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${h[0]}/${h.slice(0, 2)}/${enc}/${width}px-${enc}${/\.svg$/i.test(name) ? ".png" : ""}`;
}

interface Subject {
  id: string;
  name: string;
  links: number;
  /** كل القيم (حتى غير المسمّاة بالعربي) لحساب value_count بأمان */
  values: { id: string; label: string | null }[];
  image?: string;
  extra?: Record<string, unknown>;
}

/** يحوّل المواضيع المجمّعة إلى حقائق مرتبة بالشهرة (دالة نقية — مختبرة) */
export function subjectsToFacts(
  subjects: Subject[],
  recipe: Pick<FactRecipe, "id" | "categorySlug" | "subcategorySlug">,
  property: string,
  retrievedAt: string,
): SourceFactInput[] {
  const ranked = [...subjects].sort((a, b) => b.links - a.links || a.id.localeCompare(b.id));
  const facts: SourceFactInput[] = [];
  ranked.forEach((s, rankIndex) => {
    for (const v of s.values) {
      if (!v.label) continue;
      facts.push({
        provider: "wikidata",
        external_id: s.id,
        subject: s.name,
        predicate: recipe.id,
        object_value: v.label,
        category_slug: recipe.categorySlug,
        subcategory_slug: recipe.subcategorySlug,
        source_url: `https://www.wikidata.org/wiki/${s.id}`,
        source_name: "Wikidata",
        source_license: "CC0",
        raw_payload: {
          subject_id: s.id,
          property,
          object_id: v.id,
          value_count: s.values.length,
          popularity_rank: rankIndex,
          popularity_total: ranked.length,
          sitelinks: s.links,
          query_version: WIKIDATA_QUERY_VERSION,
          ...(s.image ? { image: s.image } : {}),
          ...(s.extra ?? {}),
        },
        retrieved_at: retrievedAt,
      });
    }
  });
  return facts;
}

/** تجميع صفوف SPARQL القياسية: ?item ?itemLabel ?value ?valueLabel ?links ?image */
export function groupBindings(rows: Binding[], literalValue = false): Subject[] {
  const by = new Map<string, Subject>();
  for (const b of rows) {
    const id = qid(b.item?.value);
    const name = b.itemLabel?.value;
    if (!id || !isLabel(name)) continue;
    const s = by.get(id) ?? { id, name: name!, links: Number(b.links?.value ?? 0), values: [] };
    const raw = b.value?.value;
    if (raw !== undefined) {
      const vid = literalValue ? raw : qid(raw);
      const label = literalValue ? raw : isLabel(b.valueLabel?.value) ? b.valueLabel!.value : null;
      if (!s.values.some((v) => v.id === vid)) s.values.push({ id: vid, label });
    }
    if (!s.image && b.image?.value) s.image = commonsThumbUrl(b.image.value);
    by.set(id, s);
  }
  return [...by.values()];
}

const COUNTRY = `?item wdt:P31 wd:Q3624078 ; wikibase:sitelinks ?links . FILTER NOT EXISTS { ?item wdt:P576 ?d }`;
const LABELS = `SERVICE wikibase:label { bd:serviceParam wikibase:language "ar". }`;

function sparqlRecipe(r: Omit<FactRecipe, "fetchAll"> & { property: string; query: string; literal?: boolean }): FactRecipe {
  return {
    id: r.id,
    label: r.label,
    categorySlug: r.categorySlug,
    subcategorySlug: r.subcategorySlug,
    fetchAll: async (at) => subjectsToFacts(groupBindings(await sparql(r.query), r.literal), r, r.property, at),
  };
}

// ------------------------------------------------------------------ الحيوانات (استعلامان)
/** الطوائف المعتمدة. الطيور مصنّفة داخل الزواحف في Wikidata — الأخص يفوز */
export const ANIMAL_CLASSES: Record<string, string> = {
  Q5113: "الطيور",
  Q7377: "الثدييات",
  Q10811: "الزواحف",
  Q10908: "البرمائيات",
  Q127282: "الأسماك",
  Q1390: "الحشرات",
};
/** رتب مقبولة (لا «حشرات» أو «قوارض» كإجابة لصورة حيوان) */
const ANIMAL_RANKS = new Set(["Q7432", "Q34740", "Q35409", "Q68947"]); // نوع، جنس، فصيلة، نويع

export function resolveAnimalClass(classIds: string[]): string | null {
  const set = new Set(classIds);
  if (set.has("Q5113")) return "Q5113"; // طائر (وإن ظهر تحت الزواحف)
  const known = [...set].filter((c) => c in ANIMAL_CLASSES);
  return known.length === 1 ? known[0] : null;
}

/** الاستعلام ثقيل (~45 ثانية): نتيجة واحدة لكل تشغيل تخدم animal_class و animal_image */
let animalsCache: Promise<Subject[]> | null = null;
function fetchAnimals(): Promise<Subject[]> {
  animalsCache ??= fetchAnimalsOnce().catch(() => fetchAnimalsOnce()); // Wikidata متقلب قرب حد الـ60 ثانية: محاولة ثانية
  animalsCache.catch(() => (animalsCache = null));
  return animalsCache;
}

async function fetchAnimalsOnce(): Promise<Subject[]> {
  // 1) حيوانات/نباتات لها اسم عربي شائع (P1843) وشهرة كافية (~35 ثانية)
  const rows = await sparql(`SELECT ?item ?itemLabel ?image ?rank ?links WHERE {
    ?item wdt:P1843 ?cn . FILTER(LANG(?cn) = "ar")
    ?item wikibase:sitelinks ?links . FILTER(?links > 60)
    OPTIONAL { ?item wdt:P18 ?image }
    OPTIONAL { ?item wdt:P105 ?rank }
    ?item rdfs:label ?arl . FILTER(LANG(?arl) = "ar")
    ${LABELS} }`);
  const subjects = new Map<string, Subject & { ranks: Set<string> }>();
  for (const b of rows) {
    const id = qid(b.item?.value);
    if (!id || !isLabel(b.itemLabel?.value)) continue;
    const s = subjects.get(id) ?? { id, name: b.itemLabel!.value, links: Number(b.links?.value ?? 0), values: [], ranks: new Set<string>() };
    if (!s.image && b.image?.value) s.image = commonsThumbUrl(b.image.value);
    if (b.rank?.value) s.ranks.add(qid(b.rank.value));
    subjects.set(id, s);
  }
  const eligible = [...subjects.values()].filter((s) => [...s.ranks].some((r) => ANIMAL_RANKS.has(r)));
  if (!eligible.length) return [];

  // 2) الطائفة لكل منها (~10 ثوانٍ) — النباتات لا تطابق أي طائفة فتسقط
  const cls = await sparql(`SELECT ?item ?class WHERE {
    VALUES ?item { ${eligible.map((s) => `wd:${s.id}`).join(" ")} }
    VALUES ?class { ${Object.keys(ANIMAL_CLASSES).map((c) => `wd:${c}`).join(" ")} }
    ?item wdt:P171* ?class . }`);
  const byItem = new Map<string, string[]>();
  for (const b of cls) byItem.set(qid(b.item?.value), [...(byItem.get(qid(b.item?.value)) ?? []), qid(b.class?.value)]);

  const out: Subject[] = [];
  for (const s of eligible) {
    const c = resolveAnimalClass(byItem.get(s.id) ?? []);
    if (!c) continue;
    out.push({ id: s.id, name: s.name, links: s.links, image: s.image, values: [{ id: c, label: ANIMAL_CLASSES[c] }] });
  }
  return out;
}

// ------------------------------------------------------------------ السجل
export const RECIPES: FactRecipe[] = [
  {
    id: "capital",
    label: "عواصم الدول",
    categorySlug: "geography",
    subcategorySlug: "capitals",
    fetchAll: async (at) => countriesToFacts(await fetchWikidataCountries(), "capital", Number.MAX_SAFE_INTEGER, at),
  },
  {
    id: "currency",
    label: "عملات الدول",
    categorySlug: "geography",
    subcategorySlug: "countries",
    fetchAll: async (at) => countriesToFacts(await fetchWikidataCountries(), "currency", Number.MAX_SAFE_INTEGER, at),
  },
  {
    id: "flag",
    label: "أعلام الدول (صورة)",
    categorySlug: "geography",
    subcategorySlug: "flags",
    fetchAll: async (at) =>
      subjectsToFacts(
        (await fetchWikidataCountries())
          .filter((c) => c.flag)
          .map((c) => {
            const img = commonsThumbUrl(c.flag!);
            return { id: c.id, name: c.name, links: c.links, image: img, values: [{ id: img, label: img }] };
          }),
        { id: "flag", categorySlug: "geography", subcategorySlug: "flags" },
        "P41",
        at,
      ),
  },
  sparqlRecipe({
    id: "continent",
    label: "قارة الدولة",
    categorySlug: "geography",
    subcategorySlug: "countries",
    property: "P30",
    query: `SELECT ?item ?itemLabel ?value ?valueLabel ?links WHERE { ${COUNTRY} ?item wdt:P30 ?value . ${LABELS} }`,
  }),
  sparqlRecipe({
    id: "official_language",
    label: "اللغة الرسمية",
    categorySlug: "geography",
    subcategorySlug: "countries",
    property: "P37",
    query: `SELECT ?item ?itemLabel ?value ?valueLabel ?links WHERE { ${COUNTRY} ?item wdt:P37 ?value . ${LABELS} }`,
  }),
  sparqlRecipe({
    id: "element_symbol",
    label: "رموز العناصر الكيميائية",
    categorySlug: "science",
    subcategorySlug: "chemistry",
    property: "P246",
    literal: true,
    query: `SELECT ?item ?itemLabel ?value ?links WHERE { ?item wdt:P31 wd:Q11344 ; wdt:P246 ?value ; wikibase:sitelinks ?links . ${LABELS} }`,
  }),
  sparqlRecipe({
    id: "atomic_number",
    label: "العدد الذري",
    categorySlug: "science",
    subcategorySlug: "chemistry",
    property: "P1086",
    literal: true,
    query: `SELECT ?item ?itemLabel ?value ?links WHERE { ?item wdt:P31 wd:Q11344 ; wdt:P1086 ?value ; wikibase:sitelinks ?links . ${LABELS} }`,
  }),
  sparqlRecipe({
    id: "heritage_country",
    label: "مواقع التراث العالمي",
    categorySlug: "geography",
    subcategorySlug: "landmarks",
    property: "P17",
    query: `SELECT ?item ?itemLabel ?value ?valueLabel ?image ?links WHERE {
      ?item wdt:P1435 wd:Q9259 ; wdt:P17 ?value ; wikibase:sitelinks ?links . FILTER(?links > 25)
      OPTIONAL { ?item wdt:P18 ?image }
      ?item rdfs:label ?arl . FILTER(LANG(?arl) = "ar")
      ${LABELS} }`,
  }),
  {
    id: "animal_class",
    label: "طائفة الحيوان",
    categorySlug: "science",
    subcategorySlug: "animals",
    fetchAll: async (at) => subjectsToFacts(await fetchAnimals(), { id: "animal_class", categorySlug: "science", subcategorySlug: "animals" }, "P171", at),
  },
  {
    id: "animal_image",
    label: "صور الحيوانات",
    categorySlug: "science",
    subcategorySlug: "animals",
    fetchAll: async (at) =>
      subjectsToFacts(
        (await fetchAnimals())
          .filter((a) => a.image)
          .map((a) => ({ ...a, values: [{ id: a.image!, label: a.image! }] })),
        { id: "animal_image", categorySlug: "science", subcategorySlug: "animals" },
        "P18",
        at,
      ),
  },
];

/** أول n مواضيع جديدة (مع كل قيمها) بترتيب الشهرة */
export function takeNewSubjects(facts: SourceFactInput[], seen: Set<string>, n: number): SourceFactInput[] {
  const picked = new Set<string>();
  return facts.filter((f) => {
    if (seen.has(f.external_id)) return false;
    if (picked.has(f.external_id)) return true;
    if (picked.size >= n) return false;
    picked.add(f.external_id);
    return true;
  });
}

export const RECIPE_IDS = RECIPES.map((r) => r.id);
export const getRecipe = (id: string) => RECIPES.find((r) => r.id === id) ?? null;
export const isRecipeId = (v: unknown): v is string => typeof v === "string" && RECIPE_IDS.includes(v);
