"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Lock } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Button, PasswordInput } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/access/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "تعذر تسجيل الدخول");
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center p-5">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <Logo size={230} className="animate-float" />
          <p className="mt-4 text-white/60">أدخل رمز الدخول وكلمة المرور لبدء اللعب</p>
        </div>
        <form onSubmit={submit} className="panel space-y-4 p-6">
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-white/75">رمز الدخول</span>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute right-3 top-3 h-5 w-5 text-white/35" />
              <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="username" required className="w-full pr-10" dir="ltr" />
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-white/75">كلمة المرور</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute right-3 top-3 z-10 h-5 w-5 text-white/35" />
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="pr-10"
              />
            </div>
          </label>
          {error && <p className="rounded-xl bg-wine-500/20 px-3 py-2 text-sm text-wine-400">{error}</p>}
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            دخول
          </Button>
        </form>
      </div>
    </main>
  );
}
