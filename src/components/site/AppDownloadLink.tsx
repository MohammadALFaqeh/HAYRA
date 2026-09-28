"use client";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

/** شعار روبوت أندرويد */
function AndroidIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85a.637.637 0 0 0-.83.22l-1.88 3.24a11.46 11.46 0 0 0-8.94 0L5.65 5.67a.643.643 0 0 0-.87-.2c-.28.18-.37.54-.22.83L6.4 9.48A10.78 10.78 0 0 0 1 18h22a10.78 10.78 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z" />
    </svg>
  );
}

/** شارة تنزيل تطبيق الأندرويد — تختفي داخل التطبيق نفسه وعلى أجهزة آبل */
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
      aria-label="تنزيل تطبيق حيرة لأجهزة Android"
      className={cn(
        "group inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-black/60 py-2.5 pe-3 ps-4 text-start shadow-lg transition hover:border-leaf-400/60 hover:bg-black/80 active:scale-[.98]",
        className,
      )}
    >
      <AndroidIcon className="h-9 w-9 shrink-0 text-[#3DDC84]" />
      <span className="flex flex-1 flex-col leading-tight">
        <span className="text-[11px] text-white/60">حمّل التطبيق الآن</span>
        <span className="font-display text-lg font-extrabold">
          حيرة لأجهزة <bdi dir="ltr" className="font-sans tracking-wide">Android</bdi>
        </span>
        <span className="text-[10px] text-white/45">
          <bdi dir="ltr">APK · 117 KB</bdi>
        </span>
      </span>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#3DDC84] text-night-950 transition group-hover:translate-y-0.5">
        <Download className="h-5 w-5" strokeWidth={2.5} />
      </span>
    </a>
  );
}
