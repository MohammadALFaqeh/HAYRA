"use client";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const FIXED_PATHS = ["/login", "/admin/login"];

/** حقوق التصميم: ثابتة في صفحات الدخول، وفي آخر الصفحة داخل الموقع حتى لا تغطي المحتوى */
export function Credit() {
  const fixed = FIXED_PATHS.includes(usePathname());
  return (
    <div className={cn(fixed ? "pointer-events-none fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 z-40" : "flex justify-start px-4 pb-4 pt-8")}>
      <span className="rounded-full border border-gold-400/30 bg-night-950/80 px-3.5 py-1.5 font-display text-xs font-bold text-gold-300 shadow-lg backdrop-blur-sm sm:text-sm">
        تصميم وتطوير: م. محمد عادل الفقيه
      </span>
    </div>
  );
}
