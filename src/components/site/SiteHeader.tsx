"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import Image from "next/image";

export function SiteHeader() {
  const router = useRouter();
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-5 sm:py-4">
      <Link href="/" className="flex items-center gap-2" aria-label="الرئيسية">
        <Image src="/brand/logo.png" alt="حيرة" width={418} height={330} style={{ width: 64, height: "auto" }} />
      </Link>
      <nav className="flex items-center gap-0.5 text-xs font-semibold sm:gap-1 sm:text-sm">
        <Link href="/packs" className="rounded-xl px-2 py-2 text-white/75 hover:bg-white/[0.06] hover:text-white sm:px-3">
          الباقات
        </Link>
        <Link href="/how-to-play" className="rounded-xl px-2 py-2 text-white/75 hover:bg-white/[0.06] hover:text-white sm:px-3">
          طريقة اللعب
        </Link>
        <button
          onClick={async () => {
            await fetch("/api/access/logout", { method: "POST" });
            router.replace("/login");
          }}
          className="rounded-xl p-2 text-white/50 hover:bg-white/[0.06] hover:text-white"
          aria-label="تسجيل الخروج"
          title="تسجيل الخروج"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </nav>
    </header>
  );
}
