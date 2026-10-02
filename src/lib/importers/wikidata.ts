// Wikidata SPARQL — بيانات الدول (عواصم، أعلام، عملات) بأسماء عربية
import { depthFor, fetchJson, sampleWith, seededRandom, shuffleWith, type ImportResult, type QuestionDraft } from "./types";

export type WikidataTemplate = "capitals" | "flags" | "currencies";
export const WIKIDATA_TEMPLATES: Record<WikidataTemplate, string> = {
  capitals: "عواصم الدول",
  flags: "أعلام الدول (صورة)",
  currencies: "عملات الدول",
};

const ENDPOINT = "https://query.wikidata.org/sparql";
const SRC = "Wikidata (CC0)";

const QUERY = `
SELECT ?country ?countryLabel ?capital ?capitalLabel ?flag ?currency ?currencyLabel ?links WHERE {
  ?country wdt:P31 wd:Q3624078 ;
           wikibase:sitelinks ?links .
  FILTER NOT EXISTS { ?country wdt:P576 ?dissolved }
  OPTIONAL { ?country wdt:P36 ?capital . }
  OPTIONAL { ?country wdt:P41 ?flag . }
  OPTIONAL { ?country wdt:P38 ?currency . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ar". }
}`;

interface Binding {
  [k: string]: { value: string } | undefined;
}

const isLabel = (v?: string) => !!v && !/^Q\d+$/.test(v) && !/^https?:/.test(v);

export interface WikidataEntityRef {
  id: string;
  label: string;
}

/** دولة واحدة بعد تجميع صفوف SPARQL — القيم المتعددة بترتيب ظهورها */
export interface WikidataCountry {
  id: string;
  name: string;
  links: number;
  capitals: WikidataEntityRef[];
  currencies: WikidataEntityRef[];
  flag?: string;
}

const entityId = (uri?: string) => uri?.split("/").pop() ?? "";

/** يجلب الدول من Wikidata ويجمّعها، مرتبة حسب الشهرة (عدد روابط ويكيبيديا) تنازليًا */
export async function fetchWikidataCountries(): Promise<WikidataCountry[]> {
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(QUERY)}`;
  const data = await fetchJson<{ results: { bindings: Binding[] } }>(
    url,
    { headers: { Accept: "application/sparql-results+json", "User-Agent": "HayraTriviaImporter/1.0 (educational project)" } },
    55000,
  );

  // تجميع الصفوف حسب الدولة
  const byCountry = new Map<string, WikidataCountry>();
  const addRef = (list: WikidataEntityRef[], uri: string | undefined, label: string | undefined) => {
    if (!isLabel(label)) return;
    const id = entityId(uri) || label!;
    if (!list.some((r) => r.id === id)) list.push({ id, label: label! });
  };
  for (const b of data.results.bindings) {
    const id = entityId(b.country?.value);
    const name = b.countryLabel?.value;
    if (!id || !isLabel(name)) continue;
    const cur = byCountry.get(id) ?? { id, name: name!, links: Number(b.links?.value ?? 0), capitals: [], currencies: [] };
    addRef(cur.capitals, b.capital?.value, b.capitalLabel?.value);
    if (!cur.flag && b.flag?.value) cur.flag = b.flag.value.replace(/^http:/, "https:") + "?width=640";
    addRef(cur.currencies, b.currency?.value, b.currencyLabel?.value);
    byCountry.set(id, cur);
  }

  // الأكثر شهرة (عدد روابط ويكيبيديا) = أسهل
  return [...byCountry.values()].sort((a, b) => b.links - a.links);
}

/** الصعوبة حسب ترتيب الشهرة بين كل الدول (0 = الأشهر) */
export function popularityDifficulty(rankIndex: number, total: number): number {
  const p = rankIndex / Math.max(1, total);
  return p < 0.12 ? 1 : p < 0.28 ? 2 : p < 0.45 ? 3 : p < 0.65 ? 4 : p < 0.85 ? 5 : 6;
}

export async function importWikidata(opts: { template: WikidataTemplate; amount?: number }): Promise<ImportResult> {
  // أول قيمة صالحة لكل دولة — نفس سلوك المستورد الأصلي
  const countries = (await fetchWikidataCountries()).map((c) => ({
    id: c.id,
    name: c.name,
    links: c.links,
    capital: c.capitals[0]?.label,
    flag: c.flag,
    currency: c.currencies[0]?.label,
  }));
  const difficultyOf = (idx: number) => popularityDifficulty(idx, countries.length);
  const rank = new Map(countries.map((c, i) => [c.id, i]));
  const random = seededRandom(Date.now());
  const amount = Math.max(1, Math.min(200, opts.amount ?? 40));
  const drafts: QuestionDraft[] = [];

  if (opts.template === "capitals") {
    const pool = countries.filter((c) => c.capital && c.capital !== c.name);
    for (const c of sampleWith(pool, amount, random)) {
      const d = difficultyOf(rank.get(c.id)!);
      drafts.push({
        category: "geography",
        subcategory: "capitals",
        type: "text",
        question_text: `ما عاصمة ${c.name}؟`,
        answer: c.capital!,
        difficulty: d,
        depth_level: depthFor(d),
        source: SRC,
        reference: `wikidata:${c.id}`,
        tags: ["عواصم", "wikidata"],
        external_id: `capital:${c.id}`,
      });
    }
  } else if (opts.template === "flags") {
    const pool = countries.filter((c) => c.flag);
    for (const c of sampleWith(pool, amount, random)) {
      const d = difficultyOf(rank.get(c.id)!);
      const others = sampleWith(pool.filter((x) => x.id !== c.id && Math.abs((rank.get(x.id) ?? 0) - rank.get(c.id)!) < 40), 3, random);
      drafts.push({
        category: "geography",
        subcategory: "flags",
        type: d >= 4 && others.length === 3 ? "multiple_choice" : "identify_image",
        question_text: "لأي دولة هذا العلم؟",
        answer: c.name,
        choices: d >= 4 && others.length === 3 ? shuffleWith([c.name, ...others.map((o) => o.name)], random) : null,
        image_url: c.flag!,
        difficulty: d,
        depth_level: depthFor(d),
        source: SRC,
        reference: `wikidata:${c.id}`,
        tags: ["أعلام", "wikidata"],
        external_id: `flag:${c.id}`,
      });
    }
  } else {
    const pool = countries.filter((c) => c.currency);
    for (const c of sampleWith(pool, amount, random)) {
      const d = Math.min(6, difficultyOf(rank.get(c.id)!) + 1);
      drafts.push({
        category: "geography",
        subcategory: "countries",
        type: "text",
        question_text: `ما اسم عملة ${c.name}؟`,
        answer: c.currency!,
        difficulty: d,
        depth_level: depthFor(d),
        source: SRC,
        reference: `wikidata:${c.id}`,
        tags: ["عملات", "wikidata"],
        external_id: `currency:${c.id}`,
      });
    }
  }

  return {
    drafts,
    notes: ["الأسماء العربية من Wikidata قد تختلف عن الشائع — راجعها. الصعوبة مقدّرة حسب شهرة الدولة."],
  };
}
