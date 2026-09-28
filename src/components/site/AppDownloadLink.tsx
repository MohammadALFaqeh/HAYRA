"use client";
import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

/** رابط تنزيل تطبيق الأندرويد — يختفي داخل التطبيق نفسه وعلى أجهزة آبل */
export function AppDownloadLink({ className }: { className?: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const inApp = document.referrer.startsWith("android-app://") || window.matchMedia("(display-mode: standalone)").matches;
    const apple = /iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent) && "ontouchend" in document;
    setShow(!inApp && !apple);
  }, []);

  if (!show) return null;
  return (
    <a
      href="/hayra.apk"
      download="hayra.apk"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl border border-leaf-400/40 bg-leaf-500/10 px-4 py-2.5 text-sm font-bold text-leaf-400 hover:bg-leaf-500/20",
        className,
      )}
    >
      <Smartphone className="h-4 w-4" /> نزّل تطبيق حيرة لأندرويد
    </a>
  );
}
