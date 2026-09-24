import type { NextRequest } from "next/server";
import { DEFAULT_SETTINGS, LEVELS, POWERUP_IDS, QUESTION_TYPE_IDS } from "@/lib/game/constants";
import { createInitialState } from "@/lib/game/factory";
import { buildBoard, type ColumnSpec } from "@/lib/game/select";
import { nextExpiry, publishPublic } from "@/lib/game/session-server";
import type { GameSettings, Level, PowerupId, QuestionType } from "@/lib/game/types";
import { errorJson, json } from "@/lib/http";
import { hasValidAccess, isUuid, randomKey, sha256 } from "@/lib/server-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { packIsLive, type GamePack } from "@/lib/db/types";

export const runtime = "nodejs";

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const cleanName = (v: unknown, fallback: string) => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 24) : "";
  return s || fallback;
};

function sanitizeSettings(raw: Record<string, unknown> | undefined): GameSettings {
  const r = raw ?? {};
  const d = DEFAULT_SETTINGS;
  const level = LEVELS.some((l) => l.id === r.level) ? (r.level as Level) : d.level;
  const enabledPowerups = Array.isArray(r.enabledPowerups)
    ? (r.enabledPowerups.filter((p) => POWERUP_IDS.includes(p as PowerupId)) as PowerupId[])
    : d.enabledPowerups;
  return {
    level,
    questionSeconds: clampInt(r.questionSeconds, 10, 300, d.questionSeconds),
    stealSeconds: clampInt(r.stealSeconds, 0, 120, d.stealSeconds),
    finalSeconds: clampInt(r.finalSeconds, 15, 300, d.finalSeconds),
    familyMode: bool(r.familyMode, d.familyMode),
    verifiedOnly: bool(r.verifiedOnly, d.verifiedOnly),
    powerupsEnabled: bool(r.powerupsEnabled, d.powerupsEnabled),
    enabledPowerups,
    streakEnabled: bool(r.streakEnabled, d.streakEnabled),
    streakThreshold: clampInt(r.streakThreshold, 2, 10, d.streakThreshold),
    streakBonus: clampInt(r.streakBonus, 0, 1000, d.streakBonus),
    mysteryEnabled: bool(r.mysteryEnabled, d.mysteryEnabled),
    mysteryCount: clampInt(r.mysteryCount, 0, 4, d.mysteryCount),
    finalEnabled: bool(r.finalEnabled, d.finalEnabled),
  };
}

export async function POST(req: NextRequest) {
  if (!(await hasValidAccess())) return errorJson("انتهت صلاحية الدخول — سجّل الدخول من جديد", 401);

  let body: {
    teams?: unknown[];
    settings?: Record<string, unknown>;
    columns?: { categoryId?: unknown; subcategoryId?: unknown }[];
    packSlug?: unknown;
    questionTypes?: unknown[];
  };
  try {
    body = await req.json();
  } catch {
    return errorJson("طلب غير صالح");
  }

  const sb = getServiceSupabase();
  let settings = sanitizeSettings(body.settings);
  let specs: ColumnSpec[] = [];
  let packName: string | null = null;
  let allowedTypes: QuestionType[] | null = Array.isArray(body.questionTypes)
    ? (body.questionTypes.filter((t) => QUESTION_TYPE_IDS.includes(t as QuestionType)) as QuestionType[])
    : null;

  if (typeof body.packSlug === "string" && body.packSlug) {
    const { data: pack } = await sb.from("game_packs").select("*").eq("slug", body.packSlug).maybeSingle();
    if (!pack || !packIsLive(pack as GamePack)) return errorJson("الباقة غير متاحة حاليًا", 404);
    const p = pack as GamePack;
    packName = p.name;
    if (p.family_mode) settings = { ...settings, familyMode: true };
    if (p.question_types?.length) allowedTypes = p.question_types;
    const { data: pc } = await sb
      .from("game_pack_categories")
      .select("category_id,subcategory_id,sort_order")
      .eq("pack_id", p.id)
      .order("sort_order");
    const rows = (pc ?? []) as { category_id: string; subcategory_id: string | null }[];
    // الباقة قد تحتوي خيارات أكثر من عدد الأعمدة → نختار عشوائيًا مع الحفاظ على الترتيب
    const count = Math.min(p.category_count, rows.length);
    const picked = [...rows]
      .map((r, i) => ({ r, i, k: Math.random() }))
      .sort((a, b) => a.k - b.k)
      .slice(0, count)
      .sort((a, b) => a.i - b.i)
      .map((x) => x.r);
    specs = picked.map((r) => ({ categoryId: r.category_id, subcategoryId: r.subcategory_id }));
  } else {
    specs = (body.columns ?? [])
      .filter((c) => isUuid(c?.categoryId))
      .map((c) => ({ categoryId: c.categoryId as string, subcategoryId: isUuid(c.subcategoryId) ? (c.subcategoryId as string) : null }));
  }

  if (specs.length < 3 || specs.length > 8) return errorJson("اختر من 3 إلى 8 فئات");

  const teams: [string, string] = [cleanName(body.teams?.[0], "الفريق الأول"), cleanName(body.teams?.[1], "الفريق الثاني")];
  if (teams[0] === teams[1]) teams[1] = `${teams[1]} 2`;

  // تنظيف الجلسات المهجورة (بديل pg_cron)
  await sb.rpc("cleanup_expired");

  let board;
  try {
    board = await buildBoard(sb, specs, settings, allowedTypes, Math.random);
  } catch (e) {
    return errorJson((e as Error).message || "تعذر بناء اللوحة", 500);
  }
  const playable = board.cells.filter((c) => c.status === "available").length;
  if (playable < 6) return errorJson("لا توجد أسئلة كافية لهذه الاختيارات — جرّب فئات أخرى أو ألغِ «الموثّق فقط»", 422, { warnings: board.warnings });

  const hostKey = randomKey(24);
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const state = createInitialState({
    sessionId,
    teamNames: teams,
    settings,
    columns: board.columns,
    cells: board.cells,
    questions: board.questions,
    finalQuestionId: board.finalQuestionId,
    packName,
    now,
  });

  const { error } = await sb.from("game_sessions").insert({
    id: sessionId,
    host_key_hash: sha256(hostKey),
    rev: 0,
    state,
    expires_at: nextExpiry(),
  });
  if (error) return errorJson("تعذر حفظ الجلسة: " + error.message, 500);
  await publishPublic(sb, state);

  return json({ sessionId, hostKey, warnings: board.warnings });
}
