import { clsx, type ClassValue } from "clsx";

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

export const formatPoints = (n: number) => new Intl.NumberFormat("en-US").format(n);

export const seconds = (ms: number) => Math.ceil(Math.max(0, ms) / 1000);

export const COLOR_CLASSES: Record<string, { bg: string; text: string; ring: string; soft: string; hex: string }> = {
  gold: { bg: "bg-gold-500", text: "text-gold-300", ring: "ring-gold-400/60", soft: "bg-gold-500/15", hex: "#f5b41a" },
  volt: { bg: "bg-volt-500", text: "text-volt-400", ring: "ring-volt-400/60", soft: "bg-volt-500/15", hex: "#2f7bff" },
  violet: { bg: "bg-violet-500", text: "text-violet-400", ring: "ring-violet-400/60", soft: "bg-violet-500/15", hex: "#8b45f5" },
  leaf: { bg: "bg-leaf-500", text: "text-leaf-400", ring: "ring-leaf-400/60", soft: "bg-leaf-500/15", hex: "#1fb978" },
  wine: { bg: "bg-wine-500", text: "text-wine-400", ring: "ring-wine-400/60", soft: "bg-wine-500/15", hex: "#b3263e" },
  ember: { bg: "bg-ember-500", text: "text-ember-400", ring: "ring-ember-400/60", soft: "bg-ember-500/15", hex: "#ff8a1f" },
};
export const colorOf = (c: string | null | undefined) => COLOR_CLASSES[c ?? "volt"] ?? COLOR_CLASSES.volt;

/** ألوان الفريقين ثابتة: A ذهبي، B أزرق كهربائي */
export const TEAM_COLORS = {
  A: { name: "gold", text: "text-gold-300", bg: "bg-gold-500", ring: "ring-gold-400", glow: "shadow-gold", hex: "#ffcb3d" },
  B: { name: "volt", text: "text-volt-400", bg: "bg-volt-500", ring: "ring-volt-400", glow: "shadow-volt", hex: "#4f93ff" },
} as const;
