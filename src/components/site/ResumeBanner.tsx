"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getLastSession } from "@/lib/client/storage";

/** إذا كانت هناك لعبة جارية على هذا الجهاز (مثلًا بعد تحديث الصفحة) */
export function ResumeBanner() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => setId(getLastSession()?.id ?? null), []);
  if (!id) return null;
  return (
    <Link
      href={`/game/${id}/host`}
      className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 rounded-2xl border border-gold-400/40 bg-gold-400/10 px-5 py-3 font-semibold"
    >
      <span>🎮 عندك لعبة شغالة — كمّل من حيث وقفت</span>
      <span className="text-gold-300">استئناف</span>
    </Link>
  );
}
