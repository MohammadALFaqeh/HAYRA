import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="space-y-6">
        <Logo size={180} />
        <h1 className="font-display text-4xl font-extrabold">حتى إحنا احترنا! 🤔</h1>
        <p className="text-white/60">الصفحة غير موجودة أو انتهت صلاحيتها.</p>
        <Link href="/" className="inline-block rounded-2xl bg-gold-400 px-6 py-3 font-bold text-night-950">
          العودة للرئيسية
        </Link>
      </div>
    </main>
  );
}
