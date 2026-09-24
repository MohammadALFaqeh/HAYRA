"use client";
import { motion } from "framer-motion";
import type { PublicCell } from "@/lib/game/public";
import type { BoardColumn, TeamId } from "@/lib/game/types";
import { MYSTERY } from "@/lib/game/constants";
import { cn, colorOf, TEAM_COLORS } from "@/lib/utils";

interface Props {
  columns: BoardColumn[];
  cells: PublicCell[];
  onPick?: (cell: PublicCell) => void;
  compact?: boolean;
  /** المضيف يرى علامة الخانات الغامضة؛ التلفزيون يرى «؟» فقط */
  hostMysteryKinds?: Record<string, string | null>;
}

export function Board({ columns, cells, onPick, compact, hostMysteryKinds }: Props) {
  const rows = Math.max(0, ...cells.map((c) => c.row)) + 1;
  return (
    <div className="scrollbar-none w-full overflow-x-auto pb-1">
      <div
        className={cn("grid w-full", compact ? "min-w-[520px] gap-1.5" : "min-w-[680px] gap-2 lg:min-w-0 lg:gap-3")}
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
      >
      {columns.map((col) => {
        const c = colorOf(col.color);
        return (
          <div
            key={col.key}
            className={cn(
              "group relative flex flex-col items-center justify-center overflow-hidden rounded-tile border-b-4 bg-night-800/90 text-center shadow-[0_12px_28px_-18px_rgba(0,0,0,.9)]",
              compact ? "min-h-[58px] px-1 py-1.5" : "min-h-[92px] px-2 py-3",
            )}
            style={{ borderColor: c.hex, background: `linear-gradient(145deg, ${c.hex}18, rgba(10, 16, 55, .92) 58%)` }}
          >
            <span className="absolute right-2 top-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/25">{String(columns.indexOf(col) + 1).padStart(2, "0")}</span>
            <span className={compact ? "text-lg" : "text-3xl"}>{col.icon}</span>
            <span className={cn("font-display font-bold leading-tight", compact ? "text-[11px]" : "text-sm lg:text-lg")}>{col.title}</span>
            {!compact && col.subtitle && <span className="text-[11px] text-white/45">{col.subtitle}</span>}
            {!compact && <span className="mt-2 h-0.5 w-10 rounded-full opacity-70" style={{ backgroundColor: c.hex }} />}
          </div>
        );
      })}
      {Array.from({ length: rows }).flatMap((_, r) =>
        columns.map((col, ci) => {
          const cell = cells.find((x) => x.col === ci && x.row === r);
          if (!cell) return <div key={`${col.key}-${r}`} />;
          return (
            <Tile
              key={cell.key}
              cell={cell}
              compact={compact}
              onPick={onPick}
              hostKind={hostMysteryKinds?.[cell.key] ?? null}
              delay={(r * columns.length + ci) * 0.025}
            />
          );
        }),
        )}
      </div>
    </div>
  );
}

function Tile({
  cell,
  compact,
  onPick,
  hostKind,
  delay,
}: {
  cell: PublicCell;
  compact?: boolean;
  onPick?: (cell: PublicCell) => void;
  hostKind: string | null;
  delay: number;
}) {
  const available = cell.status === "available";
  const won = cell.wonBy as TeamId | null;
  const clickable = !!onPick && cell.status !== "empty";
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
      disabled={!clickable}
      onClick={() => onPick?.(cell)}
      className={cn(
        "tile",
        compact ? "h-11 text-lg" : "h-[clamp(52px,9vh,110px)] text-[clamp(1.4rem,3.4vw,3rem)]",
        available ? "tile-lit" : "tile-used",
        cell.status === "empty" && "opacity-30",
        clickable && "cursor-pointer hover:-translate-y-1",
      )}
      aria-label={`${cell.points} نقطة`}
    >
      {cell.status === "empty" ? "—" : available ? <><span className="text-[0.42em] opacity-50">+</span>{cell.points}</> : won ? (
        <span className={cn("h-3 w-3 rounded-full", TEAM_COLORS[won].bg)} />
      ) : (
        <span className="text-base">✓</span>
      )}
      {available && cell.mystery && (
        <span
          className={cn(
            "absolute left-1.5 top-1.5 grid place-items-center rounded-full bg-violet-500 font-sans font-black text-white shadow-[0_0_12px_rgba(166,114,255,.8)]",
            compact ? "h-4 w-4 text-[9px]" : "h-6 w-6 text-xs",
          )}
          title={hostKind ? MYSTERY[hostKind as keyof typeof MYSTERY]?.name : "خانة غامضة"}
        >
          {hostKind ? MYSTERY[hostKind as keyof typeof MYSTERY]?.icon : "؟"}
        </span>
      )}
      {!available && cell.mysteryKind && (
        <span className="absolute left-1.5 top-1.5 text-xs opacity-60">{MYSTERY[cell.mysteryKind].icon}</span>
      )}
    </motion.button>
  );
}
