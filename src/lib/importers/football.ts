// football-data.org v4 — يتطلب FOOTBALL_DATA_API_KEY (الخطة المجانية تكفي للبطولات الكبرى)
import "server-only";
import { depthFor, fetchJson, type ImportResult, type QuestionDraft } from "./types";

export const FOOTBALL_COMPETITIONS: Record<string, string> = {
  PL: "الدوري الإنجليزي الممتاز",
  PD: "الدوري الإسباني",
  SA: "الدوري الإيطالي",
  BL1: "الدوري الألماني",
  FL1: "الدوري الفرنسي",
  CL: "دوري أبطال أوروبا",
  WC: "كأس العالم",
};
const SRC = "football-data.org";

interface Team {
  id: number;
  name: string;
  shortName: string;
  crest: string | null;
  venue: string | null;
  founded: number | null;
}
interface Competition {
  seasons: { startDate: string; endDate: string; winner: { name: string; shortName?: string } | null }[];
}

export async function importFootball(opts: { competition: string; include?: ("teams" | "winners")[] }): Promise<ImportResult> {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) throw new Error("أضف FOOTBALL_DATA_API_KEY في متغيرات البيئة لاستخدام football-data.org");
  const code = opts.competition;
  const compName = FOOTBALL_COMPETITIONS[code];
  if (!compName) throw new Error("بطولة غير مدعومة");
  const include = new Set(opts.include?.length ? opts.include : ["teams", "winners"]);
  const headers = { "X-Auth-Token": key };
  const drafts: QuestionDraft[] = [];
  const isLeague = !["CL", "WC"].includes(code);

  if (include.has("teams") && code !== "WC") {
    const data = await fetchJson<{ teams: Team[] }>(`https://api.football-data.org/v4/competitions/${code}/teams`, { headers });
    for (const t of data.teams) {
      const club = t.shortName || t.name;
      if (t.venue) {
        drafts.push({
          category: "sports",
          subcategory: "clubs",
          type: "text",
          question_text: `ما اسم ملعب نادي ${club}؟`,
          answer: t.venue,
          difficulty: 4,
          depth_level: 2,
          source: SRC,
          tags: ["football-data", "يحتاج ترجمة", "ملاعب"],
          language: "en",
          external_id: `venue:${t.id}`,
        });
      }
      if (t.founded) {
        drafts.push({
          category: "sports",
          subcategory: "clubs",
          type: "text",
          question_text: `في أي سنة تأسس نادي ${club}؟`,
          answer: String(t.founded),
          difficulty: 6,
          depth_level: 3,
          source: SRC,
          tags: ["football-data", "يحتاج ترجمة", "تأسيس"],
          language: "en",
          external_id: `founded:${t.id}`,
        });
      }
      if (t.crest) {
        drafts.push({
          category: "brands",
          subcategory: "logos",
          type: "logo",
          question_text: "لأي نادٍ هذا الشعار؟",
          answer: t.name,
          image_url: t.crest,
          difficulty: 3,
          depth_level: 2,
          source: SRC,
          tags: ["football-data", "يحتاج ترجمة", "شعارات أندية"],
          language: "en",
          external_id: `crest:${t.id}`,
        });
      }
    }
  }

  if (include.has("winners")) {
    const data = await fetchJson<Competition>(`https://api.football-data.org/v4/competitions/${code}`, { headers });
    const done = data.seasons.filter((s) => s.winner && new Date(s.endDate) < new Date());
    done.forEach((s, idx) => {
      const y1 = s.startDate.slice(0, 4);
      const y2 = s.endDate.slice(0, 4);
      const season = y1 === y2 ? y1 : `${y1}/${y2}`;
      const d = idx < 3 ? 3 : idx < 10 ? 4 : idx < 20 ? 5 : 6;
      drafts.push({
        category: "sports",
        subcategory: code === "CL" ? "ucl" : code === "WC" ? "world-cup" : isLeague ? "leagues" : "football",
        type: "text",
        question_text: `من بطل ${compName} موسم ${season}؟`,
        answer: s.winner!.name,
        difficulty: d,
        depth_level: depthFor(d),
        source: SRC,
        tags: ["football-data", "يحتاج ترجمة", "أبطال"],
        language: "en",
        external_id: `winner:${code}:${season}`,
      });
    });
  }

  return { drafts, notes: ["أسماء الأندية بالإنجليزية من المصدر — ترجمها قبل التفعيل."] };
}
