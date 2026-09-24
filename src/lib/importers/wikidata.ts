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
SELECT ?country ?countryLabel ?capitalLabel ?flag ?currencyLabel ?links WHERE {
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

export async function importWikidata(opts: { template: WikidataTemplate; amount?: number }): Promise<ImportResult> {
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(QUERY)}`;
  const data = await fetchJson<{ results: { bindings: Binding[] } }>(
    url,
    { headers: { Accept: "application/sparql-results+json", "User-Agent": "HayraTriviaImporter/1.0 (educational project)" } },
    55000,
  );

  // تجميع الصفوف حسب الدولة
  const byCountry = new Map<string, { id: string; name: string; capital?: string; flag?: string; currency?: string; links: number }>();
  for (const b of data.results.bindings) {
    const id = b.country?.value.split("/").pop() ?? "";
    const name = b.countryLabel?.value;
    if (!id || !isLabel(name)) continue;
    const cur = byCountry.get(id) ?? { id, name: name!, links: Number(b.links?.value ?? 0) };
    if (!cur.capital && isLabel(b.capitalLabel?.value)) cur.capital = b.capitalLabel!.value;
    if (!cur.flag && b.flag?.value) cur.flag = b.flag.value.replace(/^http:/, "https:") + "?width=640";
    if (!cur.currency && isLabel(b.currencyLabel?.value)) cur.currency = b.currencyLabel!.value;
    byCountry.set(id, cur);
  }

  // الأكثر شهرة (عدد روابط ويكيبيديا) = أسهل
  const countries = [...byCountry.values()].sort((a, b) => b.links - a.links);
  const difficultyOf = (idx: number) => {
    const p = idx / Math.max(1, countries.length);
    return p < 0.12 ? 1 : p < 0.28 ? 2 : p < 0.45 ? 3 : p < 0.65 ? 4 : p < 0.85 ? 5 : 6;
  };
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
