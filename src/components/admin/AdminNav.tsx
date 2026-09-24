"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { FileQuestion, FolderTree, Gauge, KeyRound, LogOut, Package, Upload, Home } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", label: "الرئيسية", icon: Gauge },
  { href: "/admin/questions", label: "بنك الأسئلة", icon: FileQuestion },
  { href: "/admin/categories", label: "الفئات", icon: FolderTree },
  { href: "/admin/packs", label: "الباقات", icon: Package },
  { href: "/admin/import", label: "مركز الاستيراد", icon: Upload },
  { href: "/admin/access", label: "بيانات الدخول", icon: KeyRound },
];

export function AdminNav({ email }: { email: string }) {
  const path = usePathname();
  const router = useRouter();
  return (
    <aside className="border-b border-white/10 bg-night-900/80 lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:border-b-0 lg:border-l">
      <div className="flex items-center gap-3 p-4">
        <Image src="/brand/logo.png" alt="حيرة" width={418} height={330} style={{ width: 56, height: "auto" }} />
        <div className="min-w-0">
          <div className="font-display font-bold">إدارة حيرة</div>
          <div className="truncate text-xs text-white/45" dir="ltr">
            {email}
          </div>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-2 pb-3 scrollbar-none lg:flex-col lg:px-3">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === "/admin" ? path === "/admin" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold",
                active ? "bg-gold-400 text-night-950" : "text-white/70 hover:bg-white/[0.06]",
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </Link>
          );
        })}
        <Link href="/" className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-white/55 hover:bg-white/[0.06]">
          <Home className="h-4 w-4" /> الموقع
        </Link>
        <button
          onClick={async () => {
            await getBrowserSupabase().auth.signOut();
            router.replace("/admin/login");
            router.refresh();
          }}
          className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-white/55 hover:bg-white/[0.06]"
        >
          <LogOut className="h-4 w-4" /> خروج
        </button>
      </nav>
    </aside>
  );
}
