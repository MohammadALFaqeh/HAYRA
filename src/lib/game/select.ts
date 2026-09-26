import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category, Subcategory } from "@/lib/db/types";
import { BOARD_POINTS, LEVELS, QUESTION_TYPE_IDS, RECENT_QUESTIONS_HOURS, isQrType } from "./constants";
import type {
  BoardCell,
  BoardColumn,
  GameSettings,
  MysteryKind,
  QuestionSnapshot,
  QuestionType,
} from "./types";

export interface ColumnSpec {
  categoryId: string;
  subcategoryId: string | null;
}

interface PoolRow {
  id: string;
  difficulty: number;
  depth_level: number;
  type: QuestionType;
  subcategory_id: string | null;
  times_used: number | null;
  last_used_at: string | null;
}

export interface BuiltBoard {
  columns: BoardColumn[];
  cells: BoardCell[];
  questions: Record<string, QuestionSnapshot>;
  finalQuestionId: string | null;
  warnings: string[];
}

const LIGHT_COLUMNS = "id,difficulty,depth_level,type,subcategory_id,times_used,last_used_at";
const FULL_COLUMNS =
  "id,type,question_text,answer,choices,clues,extra,image_url,audio_url,video_url,explanation,source,reference,verified,difficulty,category:categories(name),subcategory:subcategories(name)";

function shuffle<T>(arr: T[], random: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** ترتيب أفضلية العمق حسب مستوى اللعبة */
function depthRank(level: GameSettings["level"], depth: number): number {
  const target = LEVELS.find((l) => l.id === level)?.depth ?? 2;
  return Math.abs(depth - target);
}

function applyCommonFilters<T>(query: T, settings: GameSettings, types: QuestionType[] | null): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (query as any).eq("is_active", true).eq("is_blacklisted", false);
  if (settings.familyMode) q = q.eq("family_safe", true);
  if (settings.verifiedOnly) q = q.eq("verified", true);
  if (types && types.length) q = q.in("type", types);
  return q as T;
}

const DAY_MS = 86_400_000;

/**
 * درجة «القِدم» لتقليل التكرار: 0 = لم يُستخدم أبدًا، وكلما استُخدم حديثًا زادت العقوبة.
 * تعتمد على last_used_at الدائم (وليس فقط آخر 24 ساعة)، فالأسئلة تدور على البنك كله قبل أن تتكرر.
 */
function freshnessPenalty(p: PoolRow, recent: Set<string>, now: number): number {
  if (recent.has(p.id)) return 5;
  if (!p.last_used_at) return 0;
  const days = (now - new Date(p.last_used_at).getTime()) / DAY_MS;
  if (days < 1) return 5;
  if (days < 7) return 4;
  if (days < 30) return 3;
  if (days < 90) return 2;
  return 1;
}

function pickBest(
  pool: PoolRow[],
  difficulty: number,
  used: Set<string>,
  recent: Set<string>,
  level: GameSettings["level"],
  random: () => number,
  now: number,
): PoolRow | null {
  const candidates = pool.filter((p) => !used.has(p.id));
  if (!candidates.length) return null;
  // الأفضلية: صعوبة مطابقة، ثم سؤال لم يظهر (أو ظهر من زمن بعيد)، ثم عمق مناسب للمستوى.
  // سؤال جديد بفارق درجة واحدة (3) يتقدّم على سؤال مكرر اليوم بالصعوبة نفسها (5)،
  // لكن لا نبتعد درجتين (6) إلا إذا لم يبقَ غير ذلك.
  const scored = shuffle(candidates, random).map((p) => ({
    p,
    score:
      Math.abs(p.difficulty - difficulty) * 3 +
      freshnessPenalty(p, recent, now) +
      depthRank(level, p.depth_level) * 2 +
      Math.min(p.times_used ?? 0, 10) * 0.05,
  }));
  const best = Math.min(...scored.map((x) => x.score));
  // هامش صغير حتى لا يُحسم الاختيار بفرق عدد مرات الاستخدام وحده (تنويع أكبر)
  const top = scored.filter((x) => x.score <= best + 0.15);
  return top[Math.floor(random() * top.length)].p;
}

/** يرتّب المرشحين عشوائيًا مع تقديم الأقل استخدامًا مؤخرًا */
function freshFirst<T extends { id: string; last_used_at?: string | null }>(rows: T[], recent: Set<string>, random: () => number, now: number): T[] {
  const penalty = (r: T) => freshnessPenalty({ id: r.id, last_used_at: r.last_used_at ?? null } as PoolRow, recent, now);
  return shuffle(rows, random).sort((a, b) => penalty(a) - penalty(b));
}

export async function buildBoard(
  sb: SupabaseClient,
  specs: ColumnSpec[],
  settings: GameSettings,
  allowedTypes: QuestionType[] | null,
  random: () => number,
): Promise<BuiltBoard> {
  const warnings: string[] = [];
  const types = allowedTypes && allowedTypes.length ? allowedTypes.filter((t) => QUESTION_TYPE_IDS.includes(t)) : null;

  // ---------- بيانات الفئات
  const catIds = [...new Set(specs.map((s) => s.categoryId))];
  const subIds = [...new Set(specs.map((s) => s.subcategoryId).filter(Boolean))] as string[];
  const [{ data: cats, error: catErr }, { data: subs }] = await Promise.all([
    sb.from("categories").select("*").in("id", catIds),
    subIds.length ? sb.from("subcategories").select("*").in("id", subIds) : Promise.resolve({ data: [] as Subcategory[] }),
  ]);
  if (catErr) throw new Error(catErr.message);
  const catMap = new Map((cats as Category[]).map((c) => [c.id, c]));
  const subMap = new Map(((subs ?? []) as Subcategory[]).map((s) => [s.id, s]));

  // ---------- الأسئلة المستخدمة مؤخرًا
  const since = new Date(Date.now() - RECENT_QUESTIONS_HOURS * 3600_000).toISOString();
  const { data: recentRows } = await sb.from("recent_questions").select("question_id").gte("used_at", since).limit(5000);
  const recent = new Set((recentRows ?? []).map((r: { question_id: string }) => r.question_id));

  const now = Date.now();
  const used = new Set<string>();
  const columns: BoardColumn[] = [];
  const cells: BoardCell[] = [];
  const pools: PoolRow[][] = [];

  for (let ci = 0; ci < specs.length; ci++) {
    const spec = specs[ci];
    const cat = catMap.get(spec.categoryId);
    if (!cat) {
      warnings.push("فئة غير موجودة تم تجاهلها");
      continue;
    }
    const sub = spec.subcategoryId ? subMap.get(spec.subcategoryId) ?? null : null;
    const colIndex = columns.length;
    columns.push({
      key: `c${colIndex}`,
      categoryId: cat.id,
      subcategoryId: sub?.id ?? null,
      title: sub?.name ?? cat.name,
      subtitle: sub ? cat.name : null,
      icon: sub?.icon || cat.icon,
      color: cat.color,
    });

    let query = sb.from("questions").select(LIGHT_COLUMNS).eq("category_id", cat.id);
    if (sub) query = query.eq("subcategory_id", sub.id);
    query = applyCommonFilters(query, settings, types);
    const { data: pool, error } = await query.limit(4000);
    if (error) throw new Error(error.message);
    const rows = (pool ?? []) as PoolRow[];
    pools.push(rows);

    let missing = 0;
    BOARD_POINTS.forEach((points, ri) => {
      const difficulty = points / 100 + (BOARD_POINTS.indexOf(points) === ri ? 0 : 1);
      const pick = pickBest(rows, difficulty, used, recent, settings.level, random, now);
      if (pick) used.add(pick.id);
      else missing++;
      cells.push({
        key: `c${colIndex}-r${ri}`,
        col: colIndex,
        row: ri,
        points,
        questionId: pick?.id ?? null,
        status: pick ? "available" : "empty",
        mystery: null,
        mysteryRevealed: false,
        wonBy: null,
      });
    });
    if (missing) warnings.push(`«${sub?.name ?? cat.name}»: ${missing} خانة بدون سؤال مناسب`);
  }

  if (!columns.length) throw new Error("لم يتم اختيار أي فئة صالحة");

  // ---------- الخانات الغامضة
  if (settings.mysteryEnabled && settings.mysteryCount > 0) {
    const eligible = shuffle(
      cells.filter((c) => c.questionId && c.points >= 200),
      random,
    ).slice(0, Math.min(settings.mysteryCount, 4));
    const kinds: MysteryKind[] = ["bonus", "double", "golden", "challenge"];
    let qrPool: string[] | null = null;
    for (const cell of eligible) {
      let kind = kinds[Math.floor(random() * kinds.length)];
      if (kind === "challenge") {
        if (qrPool === null) {
          let q = sb.from("questions").select("id,type,last_used_at").in("type", QUESTION_TYPE_IDS.filter(isQrType));
          q = applyCommonFilters(q, { ...settings, verifiedOnly: false }, null);
          const { data } = await q.order("last_used_at", { ascending: true, nullsFirst: true }).limit(500);
          const rows = ((data ?? []) as { id: string; last_used_at: string | null }[]).filter((d) => !used.has(d.id));
          // pop() يأخذ من النهاية، لذا نعكس ليأتي الأحدث استخدامًا أولًا والأقدم آخرًا
          qrPool = freshFirst(rows, recent, random, now).reverse().map((d) => d.id);
        }
        const replacement = qrPool.pop();
        if (replacement) {
          used.delete(cell.questionId!);
          cell.questionId = replacement;
          used.add(replacement);
        } else {
          kind = "double";
        }
      }
      cell.mystery = kind;
    }
  }

  // ---------- السؤال النهائي
  let finalQuestionId: string | null = null;
  if (settings.finalEnabled) {
    const finalTypes: QuestionType[] = ["text", "multiple_choice", "identify_image"];
    const candidates = freshFirst(
      pools.flat().filter((p) => !used.has(p.id) && p.difficulty >= 5 && finalTypes.includes(p.type)),
      recent,
      random,
      now,
    );
    finalQuestionId = candidates[0]?.id ?? null;
    if (!finalQuestionId) {
      let q = sb.from("questions").select("id,last_used_at").gte("difficulty", 5).in("type", finalTypes);
      q = applyCommonFilters(q, settings, null);
      const { data } = await q.order("last_used_at", { ascending: true, nullsFirst: true }).limit(300);
      const rows = ((data ?? []) as { id: string; last_used_at: string | null }[]).filter((d) => !used.has(d.id));
      finalQuestionId = freshFirst(rows, recent, random, now)[0]?.id ?? null;
    }
    if (finalQuestionId) used.add(finalQuestionId);
    else warnings.push("لا يوجد سؤال مناسب للسؤال النهائي — سيتم تخطيه");
  }

  // ---------- جلب المحتوى الكامل للأسئلة المختارة
  const ids = [...used];
  const questions: Record<string, QuestionSnapshot> = {};
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await sb.from("questions").select(FULL_COLUMNS).in("id", ids.slice(i, i + 150));
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (data ?? []) as any[]) {
      questions[r.id] = {
        id: r.id,
        type: r.type,
        text: r.question_text,
        answer: r.answer,
        choices: Array.isArray(r.choices) ? r.choices : null,
        clues: Array.isArray(r.clues) ? r.clues : null,
        extra: r.extra ?? {},
        imageUrl: r.image_url,
        audioUrl: r.audio_url,
        videoUrl: r.video_url,
        explanation: r.explanation,
        source: r.source,
        reference: r.reference,
        verified: r.verified,
        difficulty: r.difficulty,
        categoryTitle: r.category?.name ?? "",
        subcategoryName: r.subcategory?.name ?? null,
      };
    }
  }

  if (ids.length) await sb.rpc("mark_questions_used", { p_ids: ids });

  return { columns, cells, questions, finalQuestionId, warnings };
}
