// ============================================================
// حيرة — فقرة «ملك الثواني»
// العداد يظهر أقل من ثانية ثم يختفي، ويتوقف بعد مدة سرية، والفريق يقدّر المدة
// ============================================================
import type { SecondsLevel } from "./types";

export const SECONDS_LEVELS: Record<
  SecondsLevel,
  { name: string; minMs: number; maxMs: number; decimals: number; toleranceMs: number; points: number }
> = {
  // كلما صعب المستوى: مدة أطول، ودقة أعلى (أجزاء أجزاء الثانية)، وهامش خطأ أضيق
  1: { name: "سهل", minMs: 3_000, maxMs: 8_000, decimals: 1, toleranceMs: 300, points: 100 },
  2: { name: "متوسط", minMs: 6_000, maxMs: 15_000, decimals: 2, toleranceMs: 200, points: 300 },
  3: { name: "صعب", minMs: 10_000, maxMs: 25_000, decimals: 3, toleranceMs: 100, points: 500 },
};
export const SECONDS_LEVEL_IDS = [1, 2, 3] as const satisfies readonly SecondsLevel[];

/** العد التنازلي 3-2-1 قبل بدء العداد (يعطي وقتًا لوصول الحالة للتلفزيون) */
export const SECONDS_LEAD_MS = 3_000;
/** مدة ظهور العداد قبل اختفائه */
export const SECONDS_FLASH_MS = 800;
export const SECONDS_MIN_MS = 1_000;
export const SECONDS_MAX_MS = 60_000;

/** مدة عشوائية مقرّبة حسب دقة المستوى (0.1 / 0.01 / 0.001 ثانية) */
export function randomSecondsTarget(level: SecondsLevel, random: () => number = Math.random): number {
  const { minMs, maxMs, decimals } = SECONDS_LEVELS[level];
  const step = 10 ** (3 - decimals);
  const ms = minMs + random() * (maxMs - minMs);
  return Math.min(maxMs, Math.max(minMs, Math.round(ms / step) * step));
}

/** 7400 → "7.4" حسب دقة المستوى */
export function formatSecondsMs(ms: number, decimals = 3): string {
  return (ms / 1000).toFixed(decimals);
}

/** فرق التخمين بإشارة: +0.25 / −0.10 */
export function formatSecondsDiff(diffMs: number, decimals = 3): string {
  const sign = diffMs > 0 ? "+" : diffMs < 0 ? "−" : "±";
  return `${sign}${formatSecondsMs(Math.abs(diffMs), decimals)}`;
}

/** تحويل ما يكتبه المضيف (يقبل الأرقام العربية والفاصلة) إلى ميلي ثانية */
export function parseSecondsInput(raw: string): number | null {
  const normalized = raw
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫,]/g, ".");
  if (!/^\d{1,2}(\.\d{0,3})?$/.test(normalized)) return null;
  const ms = Math.round(Number(normalized) * 1000);
  return ms > 0 && ms <= SECONDS_MAX_MS ? ms : null;
}
